// O'QI — hujjatlarni ovoz chiqarib o'qiydigan dastur (Windows ishga tushirgich).
// Ilova sahifasini 127.0.0.1 da xizmat qiladi va Microsoft Edge'da alohida oyna qilib ochadi
// (Edge'ning tabiiy o'zbek ovozlari — Madina, Sardor — shu orqali ishlaydi).
package main

import (
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"unicode/utf16"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed all:app
var appFS embed.FS

const port = "47811"
const version = "1.2.0"

var (
	token    string
	queue    = make(chan string, 32)
	lastPing atomic.Int64
	baseDir  string
)

var allowedExt = map[string]bool{".pdf": true, ".docx": true, ".pptx": true, ".xlsx": true, ".txt": true, ".md": true, ".csv": true, ".doc": true, ".ppt": true, ".xls": true}

func psCmd(script string) *exec.Cmd {
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, v := range u {
		b[i*2], b[i*2+1] = byte(v), byte(v>>8)
	}
	return hidden(exec.Command("powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64.StdEncoding.EncodeToString(b)))
}


func main() {
	baseDir = filepath.Join(os.Getenv("LOCALAPPDATA"), "OQI")
	if os.Getenv("LOCALAPPDATA") == "" {
		baseDir = filepath.Join(os.TempDir(), "OQI")
	}
	os.MkdirAll(baseDir, 0755)
	arg := ""
	for _, a := range os.Args[1:] {
		if !strings.HasPrefix(a, "--") {
			if abs, err := filepath.Abs(a); err == nil {
				arg = abs
			}
		}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil { // dastur allaqachon ishlayapti
		tok, _ := os.ReadFile(filepath.Join(baseDir, "token"))
		if arg != "" {
			r, err := http.Post("http://127.0.0.1:"+port+"/api/queue?k="+string(tok)+"&path="+url.QueryEscape(arg), "text/plain", nil)
			if err == nil && r.StatusCode == 200 {
				return
			}
		}
		launch(string(tok))
		return
	}
	b := make([]byte, 16)
	rand.Read(b)
	token = hex.EncodeToString(b)
	os.WriteFile(filepath.Join(baseDir, "token"), []byte(token), 0600)
	install()
	if arg != "" {
		queue <- arg
	}

	sub, _ := fs.Sub(appFS, "app")
	files := http.FileServer(http.FS(sub))
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		files.ServeHTTP(w, r)
	})
	ok := func(r *http.Request) bool { return r.URL.Query().Get("k") == token }
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		if !ok(r) {
			http.Error(w, "no", 403)
			return
		}
		lastPing.Store(time.Now().Unix())
		w.Write([]byte(version))
	})
	mux.HandleFunc("/api/queue", func(w http.ResponseWriter, r *http.Request) {
		if !ok(r) {
			http.Error(w, "no", 403)
			return
		}
		if p := r.URL.Query().Get("path"); p != "" {
			select {
			case queue <- p:
			default:
			}
		}
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/api/next", func(w http.ResponseWriter, r *http.Request) {
		if !ok(r) {
			http.Error(w, "no", 403)
			return
		}
		lastPing.Store(time.Now().Unix())
		w.Header().Set("Content-Type", "application/json")
		select {
		case p := <-queue:
			json.NewEncoder(w).Encode(map[string]string{"path": p})
		case <-time.After(25 * time.Second):
			w.Write([]byte("{}"))
		case <-r.Context().Done():
		}
	})
	mux.HandleFunc("/api/pick", func(w http.ResponseWriter, r *http.Request) {
		if !ok(r) {
			http.Error(w, "no", 403)
			return
		}
		ps := `Add-Type -AssemblyName System.Windows.Forms;[Console]::OutputEncoding=[Text.Encoding]::UTF8;` +
			`$f=New-Object System.Windows.Forms.Form;$f.TopMost=$true;$f.ShowInTaskbar=$false;$f.WindowState='Minimized';$f.Show();$f.Hide();` +
			`$d=New-Object System.Windows.Forms.OpenFileDialog;$d.Title="O'QI - hujjatni tanlang";` +
			`$d.Filter='Hujjatlar (PDF, Word, PowerPoint, Excel, TXT)|*.pdf;*.docx;*.pptx;*.xlsx;*.txt;*.doc;*.ppt|Barcha fayllar|*.*';` +
			`if($d.ShowDialog($f) -eq 'OK'){Write-Output $d.FileName}`
		out, _ := psCmd(ps).Output()
		lastPing.Store(time.Now().Unix())
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"path": strings.TrimSpace(strings.TrimPrefix(string(out), "\uFEFF"))})
	})
	mux.HandleFunc("/api/topdf", func(w http.ResponseWriter, r *http.Request) {
		if !ok(r) || r.Method != "POST" {
			http.Error(w, "no", 403)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 200<<20))
		if err != nil {
			http.Error(w, "read", 400)
			return
		}
		lastPing.Store(time.Now().Unix())
		pdf, msg := docToPdf(body, r.URL.Query().Get("ext"))
		if pdf == nil {
			http.Error(w, msg, 422)
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Write(pdf)
	})
	mux.HandleFunc("/api/file", func(w http.ResponseWriter, r *http.Request) {
		if !ok(r) {
			http.Error(w, "no", 403)
			return
		}
		p := r.URL.Query().Get("path")
		if !allowedExt[strings.ToLower(filepath.Ext(p))] {
			http.Error(w, "type", 415)
			return
		}
		f, err := os.Open(p)
		if err != nil {
			http.Error(w, "not found", 404)
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/octet-stream")
		io.Copy(w, f)
	})
	go http.Serve(ln, mux)

	lastPing.Store(time.Now().Unix() + 40) // birinchi ochilish uchun vaqt
	launch(token)
	for {
		time.Sleep(5 * time.Second)
		if time.Now().Unix()-lastPing.Load() > 120 {
			os.Exit(0)
		}
	}
}

func edgePath() string {
	cands := []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Microsoft\Edge\Application\msedge.exe`),
	}
	for _, c := range cands {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	if p, err := exec.LookPath("msedge.exe"); err == nil {
		return p
	}
	return ""
}

func launch(tok string) {
	u := "http://127.0.0.1:" + port + "/?k=" + tok
	prof := filepath.Join(baseDir, "edge")
	if _, err := os.Stat(prof); err != nil { // mikrofonga oldindan ruxsat
		os.MkdirAll(filepath.Join(prof, "Default"), 0755)
		pref := `{"browser":{"has_seen_welcome_page":true},"profile":{"content_settings":{"exceptions":{"media_stream_mic":{"http://127.0.0.1:` + port + `,*":{"last_modified":"13370000000000000","setting":1}}}}}}`
		os.WriteFile(filepath.Join(prof, "Default", "Preferences"), []byte(pref), 0644)
	}
	if e := edgePath(); e != "" {
		exec.Command(e, "--app="+u, "--user-data-dir="+prof, "--no-first-run", "--no-default-browser-check",
			"--window-size=1280,900", "--disable-features=msEdgeSidebarV2,msHubApps", "--autoplay-policy=no-user-gesture-required").Start()
		return
	}
	hidden(exec.Command("rundll32", "url.dll,FileProtocolHandler", u)).Start()
}

// Ish stoli / Pusk yorliqlari va "Ochish bilan" (Open with) ro'yxatiga qo'shish
func install() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	marker := filepath.Join(baseDir, "installed.txt")
	if b, err := os.ReadFile(marker); err == nil && string(b) == exe+"|"+version {
		return
	}
	ps := `$e=$env:OQI_EXE;$W=New-Object -ComObject WScript.Shell;` +
		`foreach($d in @([Environment]::GetFolderPath('Desktop'),(Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))){` +
		`$s=$W.CreateShortcut((Join-Path $d "O'QI - hujjat o'qish.lnk"));$s.TargetPath=$e;$s.WorkingDirectory=(Split-Path $e);$s.IconLocation="$e,0";$s.Description="Hujjatlarni ovoz chiqarib o'qiydi";$s.Save()}`
	c := psCmd(ps)
	c.Env = append(os.Environ(), "OQI_EXE="+exe)
	c.Run()
	q := `"` + exe + `"`
	cmd := q + ` "%1"`
	reg := func(a ...string) { hidden(exec.Command("reg", append([]string{"add"}, append(a, "/f")...)...)).Run() }
	reg(`HKCU\Software\Classes\OQI.Document`, "/ve", "/d", "O'QI hujjat")
	reg(`HKCU\Software\Classes\OQI.Document\DefaultIcon`, "/ve", "/d", q+",0")
	reg(`HKCU\Software\Classes\OQI.Document\shell\open\command`, "/ve", "/d", cmd)
	reg(`HKCU\Software\Classes\Applications\OQI.exe`, "/v", "FriendlyAppName", "/d", "O'QI - ovozli o'qish")
	reg(`HKCU\Software\Classes\Applications\OQI.exe\shell\open\command`, "/ve", "/d", cmd)
	for _, x := range []string{".pdf", ".docx", ".pptx", ".xlsx", ".txt"} {
		reg(`HKCU\Software\Classes\`+x+`\OpenWithProgids`, "/v", "OQI.Document", "/t", "REG_NONE")
		reg(`HKCU\Software\Classes\Applications\OQI.exe\SupportedTypes`, "/v", x, "/d", "")
		k := `HKCU\Software\Classes\SystemFileAssociations\` + x + `\shell\OQI`
		reg(k, "/ve", "/d", "🔊 O'QI bilan ovoz chiqarib o'qish")
		reg(k, "/v", "Icon", "/d", q+",0")
		reg(k+`\command`, "/ve", "/d", cmd)
	}
	os.WriteFile(marker, []byte(exe+"|"+version), 0644)
}

// Word/PowerPoint (yoki WPS) orqali PDF — hujjat ko'rinishi aynan asl fayldagidek chiqishi uchun
var pdfCache = map[string][]byte{}
var pdfMu sync.Mutex

func docToPdf(buf []byte, ext string) ([]byte, string) {
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	pdfMu.Lock()
	defer pdfMu.Unlock()
	h := sha1.Sum(buf)
	key := hex.EncodeToString(h[:])
	if b, ok := pdfCache[key]; ok {
		return b, ""
	}
	dir, err := os.MkdirTemp("", "oqipdf")
	if err != nil {
		return nil, "temp"
	}
	defer os.RemoveAll(dir)
	in := filepath.Join(dir, "in."+ext)
	out := filepath.Join(dir, "out.pdf")
	os.WriteFile(in, buf, 0644)
	q := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
	var body string
	if ext == "pptx" || ext == "ppt" || ext == "ppsx" || ext == "pps" {
		body = `foreach($pid0 in @('PowerPoint.Application','KWPP.Application')){ if($ok){break}; try { $a=New-Object -ComObject $pid0; $p=$a.Presentations.Open($in,$true,$false,$false); $p.SaveAs($out,32); $p.Close(); try{$a.Quit()}catch{}; $ok=$true } catch { $err+=$_.Exception.Message+' | ' } }`
	} else {
		body = `foreach($pid0 in @('Word.Application','KWps.Application')){ if($ok){break}; try { $a=New-Object -ComObject $pid0; $a.Visible=$false; $a.DisplayAlerts=0; $d=$a.Documents.Open($in,$false,$true,$false); $d.ExportAsFixedFormat($out,17); $d.Close($false); try{$a.Quit()}catch{}; $ok=$true } catch { $err+=$_.Exception.Message+' | ' } }`
	}
	script := "$ErrorActionPreference='Stop'\n$in='" + q(in) + "'; $out='" + q(out) + "'; $ok=$false; $err=''\n" + body + "\nif($ok){'OK'}else{'ERR: '+$err}"
	cmd := psCmd(script)
	done := make(chan []byte, 1)
	go func() { o, _ := cmd.CombinedOutput(); done <- o }()
	var o []byte
	select {
	case o = <-done:
	case <-time.After(120 * time.Second):
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		return nil, "vaqt tugadi"
	}
	b, err := os.ReadFile(out)
	if err != nil || len(b) == 0 {
		if strings.Contains(string(o), "80040154") {
			return nil, "Word/PowerPoint topilmadi"
		}
		return nil, "aylantirib bo'lmadi"
	}
	if len(pdfCache) > 20 {
		pdfCache = map[string][]byte{}
	}
	pdfCache[key] = b
	return b, ""
}
