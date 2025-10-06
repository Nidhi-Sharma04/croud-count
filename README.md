🧠 Crowd Count Dashboard

An AI-powered Crowd Counting and Analysis Dashboard that allows users to monitor crowd density in real-time through live camera feeds or uploaded videos. It includes intelligent zone management, data visualization, and alert systems to ensure safety and efficiency in public or restricted spaces.

🚀 Features
🎥 Video Processing

Upload video or use a live camera feed for real-time crowd detection.

Detect and track people using AI-based object detection models (e.g., YOLO / OpenCV).

Perform frame-by-frame analysis to count people dynamically.

🗺️ Zone Management

Draw and define custom zones on video frames (like entrances, exits, or specific areas).

Save and manage zones for crowd flow monitoring.

📊 Analytics Dashboard

Visualize real-time people count, peak crowd times, and zone-wise distribution.

Interactive Chart.js graphs for hourly trends, activity heatmaps, and zone traffic summaries.

Smart Alerts when crowd thresholds exceed safe limits.

👤 Profiles & Management

Manage user profiles, view system stats, and control analysis from the dashboard UI.

🧩 Project Structure
crowd-count/
│
├── app.py                  # Flask backend server
├── requirements.txt        # Python dependencies
│
├── static/
│   ├── dashboard.css       # Styles for dashboard UI
│   ├── script.js           # Handles UI logic and video streaming
│   ├── background.jpg      # Optional background or logo
│   └── uploads/            # Uploaded or processed videos
│
├── templates/
│   └── dashboard.html      # Frontend dashboard interface
│
└── README.md               # Project documentation

⚙️ Installation & Setup

Follow these steps to run the project locally 👇

1️⃣ Clone the repository
git clone https://github.com/yourusername/crowd-count-dashboard.git
cd crowd-count-dashboard

2️⃣ Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate     # (Windows)
source venv/bin/activate  # (Linux/Mac)

3️⃣ Install dependencies
pip install -r requirements.txt

4️⃣ Run the Flask app
python app.py


By default, it will start at
👉 http://127.0.0.1:5000

🖥️ How to Use

Open Dashboard — Navigate to the provided URL in your browser.

Upload Video — Go to “Upload Video” to analyze pre-recorded surveillance footage.

Live Camera Mode — Switch to “Live Camera” to start real-time detection from your webcam or CCTV stream.

Create Zone — Use the drawing tool to mark areas for monitoring (e.g., entrances).

Start Analysis — Begin crowd analysis to see live counts, heatmaps, and analytics.

View Reports — Explore crowd statistics in the “Analysis” section.

🧠 Technologies Used
Layer	Technology
Frontend	HTML5, CSS3, JavaScript, Chart.js, BoxIcons
Backend	Flask (Python)
Computer Vision	OpenCV, NumPy
Visualization	Chart.js, Responsive Cards
Deployment	Flask Localhost / Cloud-ready
📸 Example Use Cases

✅ Smart surveillance for public places (malls, stations, events).
✅ Crowd management in emergencies.
✅ Real-time analytics for security control rooms.
✅ Zone-based occupancy monitoring.

⚠️ Notes

Ensure your webcam permissions are enabled for live feed analysis.

You can modify app.py to connect to IP-based CCTV feeds by replacing the camera index 0 with a stream URL.

The model can be integrated with YOLOv8 / DeepSORT for advanced tracking.

💡 Future Enhancements

Integrate deep learning models (YOLOv8 / MobileNet).

Add database support (MySQL / MongoDB) for historical analytics.

Real-time dashboard updates using Socket.IO.

Role-based user authentication (Admin/User).

🧑‍💻 Author

Nidhi Sharma
📍 Bilaspur, Himachal Pradesh
💬 Passionate about AI, Computer Vision, and Smart Automation Systems.

📜 License

This project is open-source under the MIT License.
Feel free to use, modify, and contribute.
