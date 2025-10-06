from flask import Flask, request, jsonify, send_from_directory,Response
from flask_cors import CORS
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import datetime
import json
import cv2
from ultralytics import YOLO
import os
import numpy as np
import threading
import base64
import time
# --- NEW: DeepSORT Import ---
from deep_sort_realtime.deepsort_tracker import DeepSort

# --- APP AND CORS CONFIGURATION ---
app = Flask(__name__)
CORS(app)

app.config['JWT_SECRET_KEY'] = 'a_very_strong_and_unique_secret_key'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = datetime.timedelta(hours=500000)
jwt = JWTManager(app)

# ==============================
# DB CONFIG
# ==============================
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '2005@Nidhi',
    'database': 'user_auth'
}

def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        return None

# ==============================
# YOLO MODEL + DeepSORT
# ==============================
try:
    model = YOLO("yolov8n.pt")
    print("YOLO model loaded successfully.")
except Exception as e:
    print("Error loading YOLO:", e)
    model = None

# Initialize DeepSORT tracker
deepsort = DeepSort(max_age=30)

# ==============================
# GLOBAL STATE FOR LIVE ANALYSIS
# ==============================
video_sessions = {}
session_lock = threading.Lock()
last_zone_counts = {}
class CameraSession:
    def __init__(self, source=0):
        # source=0 uses the default webcam. Change to a URL/path if needed.
        self.cap = cv2.VideoCapture(source) 
        self.is_running = False
        self.frame_lock = threading.Lock()

    def start(self):
        with self.frame_lock:
            if not self.cap.isOpened():
                 # Re-initialize the camera if it was closed
                 self.cap = cv2.VideoCapture(0) 
            self.is_running = True

    def stop(self):
        with self.frame_lock:
            self.is_running = False
            if self.cap.isOpened():
                self.cap.release()

    def generate_frames(self):
        # Standard MJPEG streaming protocol
        while self.is_running and self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret:
                # If frame read fails, try to re-init camera (e.g., if it was unplugged)
                print("Live feed: Failed to read frame.")
                break 
            
            # --- IMPORTANT: No detection or zone drawing here. Raw frames only. ---
            # Frontend will overlay the zone drawing canvas.
            
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                continue
            
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.033) # ~30 FPS

        # Clean up if the loop exits
        if self.cap.isOpened():
            self.cap.release()

global g_live_camera_session
g_live_camera_session = CameraSession(source=0) # Initialize with default webcam

@app.route('/start_live_stream', methods=['POST'])
@jwt_required()
def start_live_stream():
    global g_live_camera_session
    try:
        g_live_camera_session.start()
        return jsonify({"message": "Live stream started"}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to start live stream: {e}"}), 500

@app.route('/stop_live_stream', methods=['POST'])
@jwt_required()
def stop_live_stream():
    global g_live_camera_session
    g_live_camera_session.stop()
    # Also attempt to reset the session object to clear its resources
    g_live_camera_session = CameraSession(source=0)
    return jsonify({"message": "Live stream stopped"}), 200

@app.route('/live_feed_mjpeg')
def live_feed_mjpeg():
    # This is the unauthenticated route for the <img> tag to pull frames
    return Response(g_live_camera_session.generate_frames(), 
                    mimetype='multipart/x-mixed-replace; boundary=frame')
@app.route('/start_live_analysis', methods=['POST'])
@jwt_required()
def start_live_analysis():
    """
    Start analyzing live camera feed (YOLO + DeepSORT + zone analysis)
    and return processed frames with overlays and heatmaps.
    """
    global g_live_camera_session
    user_id = get_jwt_identity()

    if not g_live_camera_session.is_running:
        return jsonify({"error": "Live stream not started. Please start first."}), 400

    cap = g_live_camera_session.cap
    ret, frame = cap.read()
    if not ret:
        return jsonify({"error": "Failed to read live frame"}), 500

    # --- Get Zones ---
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name, coordinates FROM zones WHERE user_id=%s", (user_id,))
    zones = cursor.fetchall()

    # --- YOLO Detection ---
    results = model(frame, verbose=False)
    detections = results[0].boxes
    dets_for_tracker = []

    for det in detections:
        cls_i = int(det.cls.item()) if hasattr(det, "cls") else 0
        if cls_i == 0:  # person class
            x1, y1, x2, y2 = map(int, det.xyxy[0].tolist())
            conf = float(det.conf.item()) if hasattr(det, "conf") else 0.9
            dets_for_tracker.append(([x1, y1, x2 - x1, y2 - y1], conf, 'person'))

    h, w, _ = frame.shape
    overlay = frame.copy()
    density_map = np.zeros((h, w), dtype=np.uint8)
    person_centers = []

    # --- DeepSORT Tracking ---
    tracks = deepsort.update_tracks(dets_for_tracker, frame=frame)
    for track in tracks:
        if not track.is_confirmed():
            continue
        track_id = track.track_id
        ltrb = track.to_ltrb()
        x1, y1, x2, y2 = map(int, ltrb)
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        person_centers.append((cx, cy))

        cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 0, 0), 2)
        cv2.putText(overlay, f"ID {track_id}", (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        if 0 <= cy < h and 0 <= cx < w:
            density_map[cy, cx] = 255

    # --- Heatmap ---
    density_map_blurred = cv2.GaussianBlur(density_map, (41, 41), 0)
    heatmap_colored = cv2.applyColorMap(density_map_blurred, cv2.COLORMAP_JET)
    heatmap_overlay = cv2.addWeighted(frame, 0.5, heatmap_colored, 0.5, 0)

    # --- Zone Counting ---
    zone_counts = {}
    if user_id not in last_zone_counts:
        last_zone_counts[user_id] = {}

    for zone in zones:
        coords = json.loads(zone["coordinates"])
        pts = np.array([[p["x"], p["y"]] for p in coords], dtype=np.int32)
        
        count = sum(cv2.pointPolygonTest(pts, (cx, cy), False) >= 0 for cx, cy in person_centers)
        previous_count = last_zone_counts[user_id].get(zone["id"], 0)
        entries = max(0, count - previous_count)
        exits = max(0, previous_count - count)
        last_zone_counts[user_id][zone["id"]] = count
        zone_counts[zone["id"]] = count

        # --- Save to DB ---
        try:
            cursor.execute("""
                INSERT INTO zone_analysis (user_id, timestamp, zone_id, people_count, entries, exits)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (user_id, datetime.datetime.now(), zone["id"], count, entries, exits))
        except Exception as e:
            print("Insert error:", e)

        # Draw zone boundary
        cv2.polylines(overlay, [pts], isClosed=True, color=(0, 255, 0), thickness=2)
        cx = int(sum(p['x'] for p in coords) / len(coords))
        cy = int(sum(p['y'] for p in coords) / len(coords))
        cv2.putText(overlay, f"{zone['name']}: {count}", (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2)

    conn.commit()
    cursor.close()
    conn.close()

    # --- Encode frames for frontend ---
    _, buf_overlay = cv2.imencode('.jpg', overlay)
    _, buf_heatmap = cv2.imencode('.jpg', heatmap_overlay)
    overlay_b64 = base64.b64encode(buf_overlay).decode('utf-8')
    heatmap_b64 = base64.b64encode(buf_heatmap).decode('utf-8')

    return jsonify({
        "zone_counts": zone_counts,
        "overlay_frame": overlay_b64,
        "heatmap_frame": heatmap_b64,
        "finished": False
    }), 200

# ==============================
# AUTH ROUTES (unchanged)
# ==============================
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not all([username, email, password]):
        return jsonify({'message': 'All fields are required'}), 400
    if len(password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE email=%s", (email,))
    if cursor.fetchone():
        cursor.close()
        conn.close()
        return jsonify({'message': 'User already exists'}), 400

    hashed = generate_password_hash(password)
    cursor.execute("INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
                   (username, email, hashed))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({'message': 'User registered successfully'}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT id, username, password FROM users WHERE email=%s", (email,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if user and check_password_hash(user['password'], password):
        token = create_access_token(identity=str(user['id']))
        return jsonify({'message': 'Login successful',
                        'token': token,
                        'username': user['username']}), 200
    return jsonify({'message': 'Invalid credentials'}), 401

# ==============================
# ZONE ROUTES (unchanged)
# ==============================
@app.route('/save_zone', methods=['POST'])
@jwt_required()
def save_zone():
    user_id = get_jwt_identity()
    data = request.get_json()
    name = data.get("name")
    coords = data.get("coordinates")

    if not name or not coords:
        return jsonify({"message": "Invalid zone data"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cursor = conn.cursor()

    cursor.execute("INSERT INTO zones (user_id, name, coordinates) VALUES (%s, %s, %s)",
                   (user_id, name, json.dumps(coords)))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({"message": "Zone saved"}), 201

@app.route('/get_zones', methods=['GET'])
@jwt_required()
def get_zones():
    user_id = get_jwt_identity()
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT id, name, coordinates FROM zones WHERE user_id=%s", (user_id,))
    zones = cursor.fetchall()
    cursor.close()
    conn.close()

    for z in zones:
        z["coordinates"] = json.loads(z["coordinates"])

    return jsonify({"zones": zones}), 200

@app.route('/delete_zone/<int:zone_id>', methods=['DELETE'])
@jwt_required()
def delete_zone(zone_id):
    user_id = get_jwt_identity()
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cursor = conn.cursor()

    cursor.execute("DELETE FROM zones WHERE id=%s AND user_id=%s", (zone_id, user_id))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({"message": f"Zone {zone_id} deleted"}), 200

# ==============================
# VIDEO UPLOAD (unchanged)
# ==============================
@app.route('/upload_video', methods=['POST'])
@jwt_required()
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video'}), 400
    file = request.files['video']
    upload_dir = 'uploads'
    os.makedirs(upload_dir, exist_ok=True)
    
    user_id = get_jwt_identity()
    path = os.path.join(upload_dir, f"video_{user_id}.mp4")
    file.save(path)
    
    with session_lock:
        if user_id in video_sessions:
            video_sessions[user_id]['cap'].release()
            del video_sessions[user_id]
            
    return jsonify({'message': 'Uploaded and ready for analysis'}), 200

# ==============================
# LIVE ANALYSIS SESSIONS
# ==============================
@app.route('/start_analysis', methods=['POST'])
@jwt_required()
def start_analysis():
    user_id = get_jwt_identity()
    video_path = os.path.join("uploads", f"video_{user_id}.mp4")

    if not os.path.exists(video_path):
        return jsonify({"error": "No uploaded video found for analysis. Please upload one."}), 404

    with session_lock:
        if user_id in video_sessions:
            try:
                video_sessions[user_id]['cap'].release()
            except Exception:
                pass
            del video_sessions[user_id]
        
        if user_id in last_zone_counts:
            del last_zone_counts[user_id]
            
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return jsonify({"error": "Failed to open video file."}), 500

        video_sessions[user_id] = {
            'cap': cap,
            'total_frames': int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            'current_frame': 0
        }
    
    return jsonify({"message": "Analysis session started.", "total_frames": video_sessions[user_id]['total_frames']}), 200
# ==============================
# PROFILES ROUTE (NEW)
# ==============================
@app.route('/profiles', methods=['GET'])
@jwt_required()
def get_profiles():
    # The ID of the currently authenticated user is retrieved from the JWT token
    current_user_id = get_jwt_identity()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)

    # Fetch all user data (excluding password)
    cursor.execute("SELECT id, username, email FROM users")
    users = cursor.fetchall()
    
    cursor.close()
    conn.close()

    # Process the data to include 'status' and 'is_current' flags
    profiles = []
    for user in users:
        is_current_user = str(user['id']) == current_user_id
        profile_status = 'Active' if is_current_user else 'Inactive' 
        profile = {
            'username': user['username'],
            'email': user['email'],
            # Since the DB doesn't have an explicit status, we default to 'Active' for all registered users
            'status': profile_status, 
            # Mark the currently logged-in user
            'is_current': str(user['id']) == current_user_id 
        }
        profiles.append(profile)

    return jsonify({"profiles": profiles}), 200
# app.py: Insert this new route

# ==============================
# CURRENT USER ROUTE (NEW)
# ==============================
@app.route('/current-user', methods=['GET'])
@jwt_required()
def get_current_user():
    # Get the ID of the currently authenticated user
    user_id = get_jwt_identity()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)

    # Fetch only the username for the current user ID
    cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    
    cursor.close()
    conn.close()

    if user:
        # Return the username
        return jsonify({"username": user['username']}), 200
    else:
        # Should not happen if authentication is correct
        return jsonify({"message": "User not found"}), 404
@app.route('/get_frame_data', methods=['GET'])
@jwt_required()
def get_frame_data():
    user_id = get_jwt_identity()
    
    with session_lock:
        if user_id not in video_sessions:
            return jsonify({"error": "Analysis session not started."}), 400
        
        session = video_sessions[user_id]
        cap = session['cap']
        
        if session['current_frame'] >= session['total_frames']:
            try: cap.release()
            except Exception: pass
            del video_sessions[user_id]
            return jsonify({"message": "Video has ended.", "finished": True}), 200

        ret, frame = cap.read()
        if not ret:
            try: cap.release()
            except Exception: pass
            del video_sessions[user_id]
            return jsonify({"error": "Failed to read frame.", "finished": True}), 500
        
        session['current_frame'] += 1

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name, coordinates FROM zones WHERE user_id=%s", (user_id,))
    zones = cursor.fetchall()
    
    if not model:
        conn.close()
        return jsonify({"error": "YOLO model not loaded"}), 500

    h, w, _ = frame.shape
    results = model(frame, verbose=False)
    detections = results[0].boxes

    # Prepare detections for DeepSORT
    dets_for_tracker = []
    for det in detections:
        try:
            cls_i = int(det.cls.item())
        except Exception:
            cls_i = int(det.cls) if hasattr(det, 'cls') else 0

        if cls_i == 0:  # person
            x1, y1, x2, y2 = map(int, det.xyxy[0].tolist())
            conf = float(det.conf.item()) if hasattr(det, "conf") else 0.9
            dets_for_tracker.append(([x1, y1, x2 - x1, y2 - y1], conf, 'person'))

    overlay = frame.copy()
    density_map = np.zeros((h, w), dtype=np.uint8) 
    person_centers = []

    # DeepSORT tracking
    tracks = deepsort.update_tracks(dets_for_tracker, frame=frame)
    for track in tracks:
        if not track.is_confirmed():
            continue
        track_id = track.track_id
        ltrb = track.to_ltrb()
        x1, y1, x2, y2 = map(int, ltrb)
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

        cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 0, 0), 2)
        cv2.putText(overlay, f"ID {track_id}", (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        if 0 <= cy < h and 0 <= cx < w:
            density_map[cy, cx] = 255
            person_centers.append((cx, cy))

    # Generate heatmap
    density_map_blurred = cv2.GaussianBlur(density_map, (41, 41), 0)
    heatmap_colored = cv2.applyColorMap(density_map_blurred, cv2.COLORMAP_JET)
    frame_float = frame.astype(np.float32) / 255.0
    heatmap_float = heatmap_colored.astype(np.float32) / 255.0
    heatmap_overlay = cv2.addWeighted(frame_float, 0.5, heatmap_float, 0.5, 0)
    heatmap_overlay = (heatmap_overlay * 255).astype(np.uint8)

    # Zone counting
    zone_counts = {}
    if user_id not in last_zone_counts:
        last_zone_counts[user_id] = {}

    for zone in zones:
        coords = json.loads(zone["coordinates"])
        pts = np.array([[p["x"], p["y"]] for p in coords], dtype=np.int32)
        
        current_count = 0
        for cx, cy in person_centers:
            if cv2.pointPolygonTest(pts, (cx, cy), False) >= 0:
                current_count += 1
                        
        previous_count = last_zone_counts[user_id].get(zone["id"], 0)
        entries_this_zone = max(0, current_count - previous_count)
        exits_this_zone = max(0, previous_count - current_count)

        zone_counts[zone["id"]] = current_count
        last_zone_counts[user_id][zone["id"]] = current_count

        insert_query = """
        INSERT INTO zone_analysis (user_id, timestamp, zone_id, people_count, entries, exits) 
        VALUES (%s, %s, %s, %s, %s, %s)
        """
        try:
            cursor.execute(insert_query, (user_id, datetime.datetime.now(), zone["id"], current_count, entries_this_zone, exits_this_zone))
        except Exception as e:
            print("DB insert error:", e)

    conn.commit()
    cursor.close()
    conn.close()

    # Draw zone boundaries
    for zone in zones:
        coords = json.loads(zone["coordinates"])
        pts = np.array([[p["x"], p["y"]] for p in coords], dtype=np.int32)
        cv2.polylines(overlay, [pts], isClosed=True, color=(0, 255, 0), thickness=2)
        
        cx = int(sum([p['x'] for p in coords]) / len(coords))
        cy = int(sum([p['y'] for p in coords]) / len(coords))
        label = f"{zone['name']}: {zone_counts.get(zone['id'], 0)}"
        
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(overlay, (cx, cy - th - 8), (cx + tw + 8, cy + 6), (0, 0, 0), -1)
        cv2.putText(overlay, label, (cx + 4, cy - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    _, buffer_overlay = cv2.imencode('.jpg', overlay)
    overlay_base64 = base64.b64encode(buffer_overlay).decode('utf-8')

    _, buffer_heatmap = cv2.imencode('.jpg', heatmap_overlay)
    heatmap_base64 = base64.b64encode(buffer_heatmap).decode('utf-8')
    
    return jsonify({
        "zone_counts": zone_counts,
        "frame_number": session['current_frame'],
        "overlay_frame": overlay_base64,
        "heatmap_frame": heatmap_base64,
        "finished": False
    }), 200

@app.route('/stop_analysis', methods=['POST'])
@jwt_required()
def stop_analysis_route():
    global g_analysis_thread, g_analysis_stop_event
    
    if g_analysis_thread and g_analysis_thread.is_alive():
        print("Stopping analysis thread...")
        # 1. Set the stop event to signal the thread to exit its loop
        g_analysis_stop_event.set()
        
        # 2. Wait for the thread to finish (optional, but good practice)
        g_analysis_thread.join(timeout=5)
        
        # 3. Reset the globals for the next analysis
        g_analysis_thread = None
        g_analysis_stop_event.clear() # Clear the event for the next run
        print("Analysis stopped and globals reset.")
        
        return jsonify({"message": "Analysis stopped successfully"}), 200
    else:
        return jsonify({"message": "No active analysis to stop"}), 200

# ==============================
# DAILY SUMMARY (unchanged)
# ==============================
@app.route('/get_daily_summary', methods=['GET'])
@jwt_required()
def get_daily_summary():
    user_id = get_jwt_identity()
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor(dictionary=True)

    today = datetime.date.today()

    cursor.execute("""
        SELECT SUM(entries) as total_entries, SUM(exits) as total_exits
        FROM zone_analysis
        WHERE user_id = %s AND DATE(timestamp) = %s
    """, (user_id, today))
    daily_summary = cursor.fetchone()

    total_entries = int(daily_summary['total_entries']) if daily_summary and daily_summary['total_entries'] else 0
    total_exits = int(daily_summary['total_exits']) if daily_summary and daily_summary['total_exits'] else 0

    cursor.execute("""
        SELECT 
            HOUR(za.timestamp) as hour, 
            AVG(za.people_count) as avg_people_count,
            z.name as zone_name
        FROM zone_analysis za
        JOIN zones z ON za.zone_id = z.id
        WHERE za.user_id = %s AND DATE(za.timestamp) = %s
        GROUP BY HOUR(za.timestamp), z.name
        ORDER BY HOUR(za.timestamp)
    """, (user_id, today))
    hourly_data_raw = cursor.fetchall()
    
    hourly_trend_by_zone = {}
    for row in hourly_data_raw:
        zone_name = row['zone_name']
        hour = row['hour']
        avg_count = float(row['avg_people_count']) if row['avg_people_count'] else 0
        
        if zone_name not in hourly_trend_by_zone:
            hourly_trend_by_zone[zone_name] = [0] * 24
        
        hourly_trend_by_zone[zone_name][hour] = avg_count

    cursor.close()
    conn.close()

    return jsonify({
        "total_entries": total_entries,
        "total_exits": total_exits,
        "hourly_trend_by_zone": hourly_trend_by_zone
    }), 200

# ==============================
# STATIC ROUTES
# ==============================
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/dashboard.html')
def dashboard():
    return send_from_directory('.', 'dashboard.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

if __name__ == '__main__':
    print("Start app. Make sure table `zones` exists with: id, user_id, name, coordinates(JSON)")
    print("Also, create table `zone_analysis` with columns: id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, timestamp DATETIME, zone_id INT, people_count INT, entries INT, exits INT")
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)