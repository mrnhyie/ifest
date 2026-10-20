package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var codeRe = regexp.MustCompile(`^IF26-[A-Z0-9]{6}$`)

type Team struct {
	Name        string `json:"name"`
	Institution string `json:"institution"`
	Size        int    `json:"size"`
	LeadName    string `json:"leadName"`
	LeadEmail   string `json:"leadEmail"`
	LeadPhone   string `json:"leadPhone"`
	LeadProgram string `json:"leadProgram"`
	LeadLevel   string `json:"leadLevel"`
}

type Member struct {
	Name            string `json:"name"`
	Email           string `json:"email"`
	Phone           string `json:"phone"`
	Institution     string `json:"institution"`
	InstitutionType string `json:"institutionType"`
	Program         string `json:"program"`
	Level           string `json:"level"`
	StudentID       string `json:"studentId"`
	Gender          string `json:"gender"`
	Dietary         string `json:"dietary"`
}

type Declarations struct {
	Enrolled     bool `json:"enrolled"`
	IDsVerified  bool `json:"ids"`
	Originality  bool `json:"ip"`
	Conduct      bool `json:"conduct"`
	Media        bool `json:"media"`
	MinorConsent bool `json:"minorConsent"`
}

type Hackathon struct {
	FocusAreas []string `json:"focusAreas"`
	Track      string   `json:"track"`
	Skills     []string `json:"skills"`
	Languages  string   `json:"languages"`
	LaptopsAll string   `json:"laptopsAll"`
	Equipment  string   `json:"equipment"`
	NoPrebuilt bool     `json:"noPrebuilt"`
	LiveDemo   bool     `json:"liveDemo"`
	AlsoPitch  string   `json:"alsoPitch"`
}

type RobotWars struct {
	RobotName    string   `json:"robotName"`
	RobotType    string   `json:"robotType"`
	Weapons      []string `json:"weapons"`
	WeightKg     float64  `json:"weightKg"`
	BoxSideCm    float64  `json:"boxSideCm"`
	ExtensionCm  float64  `json:"extensionCm"`
	BatteryType  string   `json:"batteryType"`
	BatteryV     float64  `json:"batteryV"`
	KillSwitch   string   `json:"killSwitch"`
	Wireless     string   `json:"wireless"`
	LipoCount    int      `json:"lipoCount"`
	BuildStatus  string   `json:"buildStatus"`
	PitPower     string   `json:"pitPower"`
	NoFire       bool     `json:"noFire"`
	NoProjectiles bool    `json:"noProjectiles"`
	NoJammer     bool     `json:"noJammer"`
	NoHighVoltage bool    `json:"noHighVoltage"`
	NoBlades     bool     `json:"noBlades"`
	Notebook     string   `json:"notebook"`
	Awards       []string `json:"awards"`
	AlsoPitch    string   `json:"alsoPitch"`
	Inspection   bool     `json:"inspection"`
}

type Pitch struct {
	ProjectName     string   `json:"projectName"`
	Tagline         string   `json:"tagline"`
	Sector          string   `json:"sector"`
	SDGPrimary      string   `json:"sdgPrimary"`
	SDGTarget       string   `json:"sdgTarget"`
	SDGSecondary    []string `json:"sdgSecondary"`
	Problem         string   `json:"problem"`
	Affected        string   `json:"affected"`
	WhyExisting     string   `json:"whyExisting"`
	Impact          string   `json:"impact"`
	Stage           string   `json:"stage"`
	DemoURL         string   `json:"demoUrl"`
	DemoStyle       string   `json:"demoStyle"`
	Traction        string   `json:"traction"`
	BusinessModel   string   `json:"businessModel"`
	StudentLed      bool     `json:"studentLed"`
	ExistingStartup string   `json:"existingStartup"`
	StartupDetails  string   `json:"startupDetails"`
	Ask             []string `json:"ask"`
}

type Logistics struct {
	Travel         string   `json:"travel"`
	TravelNotes    string   `json:"travelNotes"`
	ArrivalDate    string   `json:"arrivalDate"`
	EmergencyName  string   `json:"emergencyName"`
	EmergencyPhone string   `json:"emergencyPhone"`
	TshirtSizes    []string `json:"tshirtSizes"`
	HeardVia       string   `json:"heardVia"`
	Comments       string   `json:"comments"`
}

type Payload struct {
	Categories   []string      `json:"categories"`
	Team         Team          `json:"team"`
	Members      []Member      `json:"members"`
	Declarations Declarations  `json:"declarations"`
	Hackathon    *Hackathon    `json:"hackathon"`
	RobotWars    *RobotWars    `json:"robotWars"`
	Pitch        *Pitch        `json:"pitch"`
	Logistics    Logistics     `json:"logistics"`
	Files        map[string]string `json:"files"`
}

type Server struct {
	db        *sql.DB
	uploadDir string
	adminTok  string
}

func main() {
	addr := getenv("ADDR", ":8090")
	token := getenv("ADMIN_TOKEN", "")
	if token == "" {
		b := make([]byte, 16)
		rand.Read(b)
		token = hex.EncodeToString(b)
		log.Println("ADMIN_TOKEN not set — generated one-time admin token:", token)
	}

	dbPath := getenv("DB_PATH", "data/ifest.db")
	os.MkdirAll(filepath.Dir(dbPath), 0o755)
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS registrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		code TEXT UNIQUE NOT NULL,
		team_name TEXT, institution TEXT, categories TEXT,
		lead_email TEXT, payload TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		log.Fatal(err)
	}

	upDir := getenv("UPLOAD_DIR", "data/uploads")
	os.MkdirAll(upDir, 0o755)
	s := &Server{db: db, uploadDir: upDir, adminTok: token}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/register", s.handleRegister)
	mux.HandleFunc("GET /api/check-member", s.handleCheckMember)
	mux.HandleFunc("GET /api/registrations", s.admin(s.handleList))
	mux.HandleFunc("GET /api/registrations/{id}", s.admin(s.handleGet))
	mux.HandleFunc("GET /api/export.csv", s.admin(s.handleCSV))

	mux.HandleFunc("GET /admin", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/admin.html")
	})
	web := os.DirFS("web")
	mux.Handle("/", http.FileServerFS(web))

	log.Println("iFESTIVAL 2026 portal listening on", addr)
	srv := &http.Server{Addr: addr, Handler: mux, ReadTimeout: 60 * time.Second, WriteTimeout: 120 * time.Second}
	log.Fatal(srv.ListenAndServe())
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func (s *Server) admin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := r.Header.Get("X-Admin-Token")
		if tok == "" {
			tok = r.URL.Query().Get("token")
		}
		if tok != s.adminTok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func newCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return "IF26-" + string(b)
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(48 << 20)
	raw := r.FormValue("payload")
	if raw == "" {
		jsonError(w, http.StatusBadRequest, "missing payload")
		return
	}
	var p Payload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid payload JSON")
		return
	}
	if err := validate(&p); err != nil {
		jsonError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	code := newCode()
	for {
		var exists int
		s.db.QueryRow(`SELECT 1 FROM registrations WHERE code=?`, code).Scan(&exists)
		if exists == 0 {
			break
		}
		code = newCode()
	}

	// server-side cross-registration checks
	p.Team.Institution = strings.TrimSpace(p.Team.Institution)
	lowInst := strings.ToLower(p.Team.Institution)
	for _, cat := range p.Categories {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM registrations WHERE lower(institution)=? AND categories LIKE ?`,
			lowInst, `%`+cat+`%`).Scan(&n)
		if n >= 2 {
			jsonError(w, http.StatusConflict, fmt.Sprintf("institution %q already has 2 teams registered for %s", p.Team.Institution, cat))
			return
		}
	}
	seen := map[string]bool{}
	for _, m := range p.Members {
		e := strings.ToLower(strings.TrimSpace(m.Email))
		if seen[e] {
			jsonError(w, http.StatusConflict, "duplicate member email within this team: "+e)
			return
		}
		seen[e] = true
		var dup string
		s.db.QueryRow(`SELECT code FROM registrations WHERE lower(json_extract(payload,'$.team.leadEmail'))=?
			OR EXISTS (SELECT 1 FROM json_each(payload,'$.members') WHERE lower(json_extract(value,'$.email'))=?) LIMIT 1`,
			e, e).Scan(&dup)
		if dup != "" {
			jsonError(w, http.StatusConflict, fmt.Sprintf("member %s is already registered in team %s", e, dup))
			return
		}
	}

	// save uploaded files
	p.Files = map[string]string{}
	keys := []string{"consent", "robotPhoto", "pitchDeck"}
	for i := range p.Members {
		keys = append(keys, fmt.Sprintf("memberId_%d", i))
	}
	extOK := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".pdf": true}
	for _, k := range keys {
		f, hdr, err := r.FormFile(k)
		if err != nil {
			continue
		}
		defer f.Close()
		ext := strings.ToLower(filepath.Ext(hdr.Filename))
		if !extOK[ext] {
			ext = ".bin"
		}
		dir := filepath.Join(s.uploadDir, code)
		os.MkdirAll(dir, 0o755)
		dst := filepath.Join(dir, k+ext)
		out, err := os.Create(dst)
		if err != nil {
			jsonError(w, 500, "failed to store upload")
			return
		}
		io.Copy(out, f)
		out.Close()
		rel, _ := filepath.Rel(s.uploadDir, dst)
		p.Files[k] = rel
	}
	if p.Declarations.MinorConsent && p.Files["consent"] == "" {
		os.RemoveAll(filepath.Join(s.uploadDir, code))
		jsonError(w, http.StatusUnprocessableEntity, "parental/guardian consent form upload is required when a member is under 18")
		return
	}

	blob, _ := json.Marshal(p)
	cats, _ := json.Marshal(p.Categories)
	_, err := s.db.Exec(`INSERT INTO registrations (code, team_name, institution, categories, lead_email, payload) VALUES (?,?,?,?,?,?)`,
		code, p.Team.Name, p.Team.Institution, string(cats), strings.ToLower(strings.TrimSpace(p.Team.LeadEmail)), string(blob))
	if err != nil {
		os.RemoveAll(filepath.Join(s.uploadDir, code))
		jsonError(w, 500, "failed to save registration")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true", "code": code})
}

func (s *Server) handleCheckMember(w http.ResponseWriter, r *http.Request) {
	email := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("email")))
	if email == "" {
		writeJSON(w, 200, map[string]any{"registered": false})
		return
	}
	var dup string
	s.db.QueryRow(`SELECT code FROM registrations WHERE lower(json_extract(payload,'$.team.leadEmail'))=?
		OR EXISTS (SELECT 1 FROM json_each(payload,'$.members') WHERE lower(json_extract(value,'$.email'))=?) LIMIT 1`,
		email, email).Scan(&dup)
	writeJSON(w, 200, map[string]any{"registered": dup != "", "team": dup})
}

type Row struct {
	ID         int    `json:"id"`
	Code       string `json:"code"`
	TeamName   string `json:"teamName"`
	Institution string `json:"institution"`
	Categories string `json:"categories"`
	LeadEmail  string `json:"leadEmail"`
	CreatedAt  string `json:"createdAt"`
	Members    int    `json:"members"`
	Payload    *Payload `json:"payload,omitempty"`
}

func (s *Server) queryRows(q string, args ...any) ([]Row, error) {
	rows, err := s.db.Query(`SELECT id, code, team_name, institution, categories, lead_email, created_at, payload FROM registrations `+q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var r Row
		var blob string
		if err := rows.Scan(&r.ID, &r.Code, &r.TeamName, &r.Institution, &r.Categories, &r.LeadEmail, &r.CreatedAt, &blob); err != nil {
			return nil, err
		}
		var p Payload
		json.Unmarshal([]byte(blob), &p)
		r.Members = len(p.Members)
		r.Payload = &p
		out = append(out, r)
	}
	return out, nil
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	cat := r.URL.Query().Get("category")
	where := "WHERE 1=1"
	var args []any
	if q != "" {
		where += ` AND (team_name LIKE ? OR institution LIKE ? OR lead_email LIKE ? OR code LIKE ?)`
		like := "%" + q + "%"
		args = append(args, like, like, like, like)
	}
	if cat != "" {
		where += " AND categories LIKE ?"
		args = append(args, `%`+cat+`%`)
	}
	where += " ORDER BY id DESC"
	rows, err := s.queryRows(where, args...)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	// slim list response
	slim := make([]Row, len(rows))
	for i, r := range rows {
		p := r.Payload
		r.Payload = &Payload{Team: p.Team, Categories: p.Categories}
		slim[i] = r
	}
	writeJSON(w, 200, slim)
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queryRows("WHERE id=?", r.PathValue("id"))
	if err != nil || len(rows) == 0 {
		jsonError(w, 404, "not found")
		return
	}
	writeJSON(w, 200, rows[0])
}

func (s *Server) handleCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queryRows("ORDER BY id DESC")
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="ifest2026-registrations.csv"`)
	cw := csv.NewWriter(w)
	cw.Write([]string{"id", "code", "team", "institution", "categories", "lead", "lead_email", "lead_phone", "members", "registered_at", "payload_json"})
	for _, r := range rows {
		p := r.Payload
		cw.Write([]string{fmt.Sprint(r.ID), r.Code, r.TeamName, r.Institution, r.Categories,
			p.Team.LeadName, r.LeadEmail, p.Team.LeadPhone, fmt.Sprint(r.Members), r.CreatedAt, string(mustJSON(p))})
	}
	cw.Flush()
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func req(cond bool, msg string) error {
	if !cond {
		return fmt.Errorf("%s", msg)
	}
	return nil
}

func validate(p *Payload) error {
	// Step 1: categories
	if len(p.Categories) == 0 {
		return fmt.Errorf("select at least one competition")
	}
	has := map[string]bool{}
	for _, c := range p.Categories {
		if c != "hackathon" && c != "robot_wars" && c != "pitch" {
			return fmt.Errorf("unknown category: %s", c)
		}
		has[c] = true
	}
	if has["hackathon"] && has["robot_wars"] {
		return fmt.Errorf("AI Hackathon and Robot Wars are mutually exclusive (both run on Days 2-4)")
	}

	// Step 2: team
	t := &p.Team
	if err := req(strings.TrimSpace(t.Name) != "", "team name is required"); err != nil {
		return err
	}
	if err := req(strings.TrimSpace(t.Institution) != "", "team lead's institution is required"); err != nil {
		return err
	}
	if t.Size < 2 || t.Size > 5 {
		return fmt.Errorf("team must have 2 to 5 members")
	}
	if err := req(strings.TrimSpace(t.LeadName) != "" && strings.TrimSpace(t.LeadPhone) != "", "team lead name and phone are required"); err != nil {
		return err
	}
	if !emailRe.MatchString(strings.TrimSpace(t.LeadEmail)) {
		return fmt.Errorf("team lead email is invalid")
	}
	if err := req(strings.TrimSpace(t.LeadProgram) != "" && strings.TrimSpace(t.LeadLevel) != "", "team lead programme and year of study are required"); err != nil {
		return err
	}

	// Step 3: members
	if len(p.Members) != t.Size {
		return fmt.Errorf("please provide details for all %d members", t.Size)
	}
	instTypes := map[string]bool{"University": true, "Technical University": true, "College": true}
	for i, m := range p.Members {
		at := fmt.Sprintf("member %d", i+1)
		if strings.TrimSpace(m.Name) == "" || !emailRe.MatchString(strings.TrimSpace(m.Email)) || strings.TrimSpace(m.Phone) == "" {
			return fmt.Errorf("%s: name, valid email and phone are required", at)
		}
		if strings.TrimSpace(m.Institution) == "" || !instTypes[m.InstitutionType] {
			return fmt.Errorf("%s: institution and institution type are required", at)
		}
		if strings.TrimSpace(m.Program) == "" || strings.TrimSpace(m.Level) == "" {
			return fmt.Errorf("%s: programme and level/year are required", at)
		}
		if strings.TrimSpace(m.StudentID) == "" {
			return fmt.Errorf("%s: student ID number is required", at)
		}
	}

	// Step 4: declarations
	d := &p.Declarations
	if err := req(d.Enrolled, "declaration required: all members are currently enrolled tertiary students"); err != nil {
		return err
	}
	if err := req(d.IDsVerified, "declaration required: student IDs will be verified at registration"); err != nil {
		return err
	}
	if err := req(d.Originality, "declaration required: originality and IP rules"); err != nil {
		return err
	}
	if err := req(d.Conduct, "declaration required: code of conduct"); err != nil {
		return err
	}
	if err := req(d.Media, "declaration required: consent for photos and videos"); err != nil {
		return err
	}

	// Category A
	if has["hackathon"] {
		h := p.Hackathon
		if h == nil {
			return fmt.Errorf("AI Hackathon section is missing")
		}
		if len(h.FocusAreas) == 0 {
			return fmt.Errorf("hackathon: select at least one focus area")
		}
		if h.LaptopsAll != "yes" && h.LaptopsAll != "no" {
			return fmt.Errorf("hackathon: answer the laptops question")
		}
		if !h.NoPrebuilt {
			return fmt.Errorf("hackathon: you must confirm no pre-built product")
		}
		if !h.LiveDemo {
			return fmt.Errorf("hackathon: you must confirm the prototype will run live")
		}
	}

	// Category B
	if has["robot_wars"] {
		b := p.RobotWars
		if b == nil {
			return fmt.Errorf("Robot Wars section is missing")
		}
		if strings.TrimSpace(b.RobotName) == "" {
			return fmt.Errorf("robot wars: robot name is required")
		}
		if !oneOf(b.RobotType, "Remote-controlled", "Autonomous", "Hybrid") {
			return fmt.Errorf("robot wars: invalid robot type")
		}
		for _, wp := range b.Weapons {
			if !oneOf(wp, "Pusher", "Wedge", "Lifter", "Flipper", "None") {
				return fmt.Errorf("robot wars: invalid weapon type %s", wp)
			}
		}
		if b.WeightKg <= 0 || b.WeightKg > 5 {
			return fmt.Errorf("robot wars: weight must be >0 and at most 5 kg")
		}
		if b.BoxSideCm <= 0 || b.BoxSideCm > 30 {
			return fmt.Errorf("robot wars: robot must fit in a 30x30x30 cm box at match start")
		}
		if b.ExtensionCm < 0 || b.ExtensionCm > 60 {
			return fmt.Errorf("robot wars: maximum extension after start is limited to 60 cm")
		}
		if b.BatteryV <= 0 || b.BatteryV > 14.8 {
			return fmt.Errorf("robot wars: battery voltage must be at most 14.8 V (4S LiPo or equivalent)")
		}
		if b.KillSwitch != "yes" {
			return fmt.Errorf("robot wars: an accessible kill switch that cuts all power is mandatory")
		}
		if !oneOf(b.Wireless, "yes", "no", "na") {
			return fmt.Errorf("robot wars: answer the wireless control question")
		}
		if b.LipoCount < 0 {
			return fmt.Errorf("robot wars: invalid LiPo battery count")
		}
		if !oneOf(b.BuildStatus, "already built", "in progress", "will be built on site") {
			return fmt.Errorf("robot wars: invalid build status")
		}
		if err := req(b.NoFire, "robot wars: safety declaration required (no fire/flammables/explosives)"); err != nil {
			return err
		}
		if err := req(b.NoProjectiles, "robot wars: safety declaration required (no projectiles/nets/tethers)"); err != nil {
			return err
		}
		if err := req(b.NoJammer, "robot wars: safety declaration required (no jammers/interference)"); err != nil {
			return err
		}
		if err := req(b.NoHighVoltage, "robot wars: safety declaration required (no high-voltage weapons)"); err != nil {
			return err
		}
		if err := req(b.NoBlades, "robot wars: safety declaration required (no bladed or spinning weapons)"); err != nil {
			return err
		}
		if err := req(b.Inspection, "robot wars: you must confirm presenting the robot for technical inspection"); err != nil {
			return err
		}
	}

	// Category C
	if has["pitch"] {
		c := p.Pitch
		if c == nil {
			return fmt.Errorf("Innovation Pitch section is missing")
		}
		if strings.TrimSpace(c.ProjectName) == "" || strings.TrimSpace(c.Tagline) == "" {
			return fmt.Errorf("pitch: project name and one-line description are required")
		}
		if !oneOf(c.Sector, "FinTech", "HealthTech", "AgriTech", "EdTech", "ClimateTech / Clean Energy", "Other") {
			return fmt.Errorf("pitch: invalid sector")
		}
		if strings.TrimSpace(c.SDGPrimary) == "" {
			return fmt.Errorf("pitch: primary SDG is required")
		}
		for _, f := range []struct{ v, label string }{
			{c.Problem, "problem statement"}, {c.Affected, "who is affected"},
			{c.WhyExisting, "why existing solutions fall short"}, {c.Impact, "expected measurable impact"},
		} {
			if strings.TrimSpace(f.v) == "" {
				return fmt.Errorf("pitch: %s is required", f.label)
			}
		}
		if !oneOf(c.Stage, "Working prototype", "Partial MVP", "Live product with users") {
			return fmt.Errorf("pitch: invalid prototype stage")
		}
		if !strings.HasPrefix(c.DemoURL, "http://") && !strings.HasPrefix(c.DemoURL, "https://") {
			return fmt.Errorf("pitch: a demo/repository/video link is required (mockups alone do not count)")
		}
		if !oneOf(c.DemoStyle, "Live", "Short walkthrough") {
			return fmt.Errorf("pitch: select a preferred demo style")
		}
		if err := req(c.StudentLed, "pitch: the pitching team must be student-led"); err != nil {
			return err
		}
		if c.ExistingStartup == "yes" && strings.TrimSpace(c.StartupDetails) == "" {
			return fmt.Errorf("pitch: provide founding date and non-student co-founder details")
		}
		if len(c.Ask) == 0 {
			return fmt.Errorf("pitch: select at least one item for 'the ask'")
		}
	}

	// Step 5: logistics
	l := &p.Logistics
	if l.Travel != "yes" && l.Travel != "no" {
		return fmt.Errorf("logistics: answer the travel/accommodation question")
	}
	if strings.TrimSpace(l.EmergencyName) == "" || strings.TrimSpace(l.EmergencyPhone) == "" {
		return fmt.Errorf("logistics: emergency contact name and phone are required")
	}
	if _, err := time.Parse("2006-01-02", l.ArrivalDate); err != nil {
		return fmt.Errorf("logistics: expected arrival date is required")
	}
	return nil
}

func oneOf(v string, opts ...string) bool {
	for _, o := range opts {
		if v == o {
			return true
		}
	}
	return false
}
