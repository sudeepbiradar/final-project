# 📧 LiveMail Classifier & Real-Time Notification System

An AI-powered, real-time email classification and notification platform that fetches messages from the Gmail API, classifies them using NLP and Keyword AI models into 7 distinct categories, persists them live in MongoDB, and delivers interactive popup notifications with synthesized audio chimes.

---

## 📌 Key Highlights

- **Real-Time Live Storing**: Every incoming email is automatically categorized and stored permanently in MongoDB.
- **Interactive Popup Windows**: Floating top-right notification windows with a 9.5s visual countdown bar and pause-on-hover capability.
- **Action Buttons in Popups**: Quick actions directly on the popup: *View Email*, *Reply*, *Mark Read*, and *Dismiss*.
- **Notification Center Drawer**: Top-bar bell icon with live unread counter badges and a full feed of recent alerts.
- **Custom Multi-Tone Audio Synth**: Distinct Web Audio API melodies tailored per category (Harp, Chime, Shimmer, Siren, Bell, Buzz, Pop).
- **Safe & Instant Deletion**: Optimistic UI removal with synchronized deletion in MongoDB, session blacklist, and Gmail Trash.
- **7-Category NLP Classification**: Personal, Business, Finance, Security, School / College, Spam, and Uncategorized.
- **Instant Simulation Trigger**: 1-click test tool to simulate live incoming emails across all categories.

---

## 🏗️ System Architecture & Data Flow

- **1. Ingestion Layer**:
  - Gmail API polls user inboxes in the background (every 25 seconds).
  - Webhook / Socket / Simulation endpoints ingest incoming email payloads.
- **2. NLP & AI Classification Layer**:
  - Natural Language Processing (Bayes Model + Keyword rules + Groq AI).
  - Automatic extraction of action items, meetings, and deadlines.
- **3. Storage Layer**:
  - MongoDB database stores emails, read states, category labels, and reminder metadata.
- **4. Real-Time Broadcast Layer**:
  - Socket.io broadcasts `new-email` events to active rooms and connected dashboards.
- **5. Presentation Layer**:
  - React Dashboard with dynamic filtering, date picker, search bar, sound controls, and live notification cards.

---

## 🚀 Core Features (Pointwise)

### 1. Real-Time Email Ingestion & Processing
- Automatically checks for new Gmail messages every 25 seconds.
- Analyzes sender headers, subject line, body text, and HTML parts.
- Extracts dates, deadlines, and action items with the integrated AI reminder engine.

### 2. Live MongoDB Storage
- Persists all categorized emails into the `emails` collection.
- Deduplicates messages using unique `userEmail` and `gmailId` indexes.
- Maintains unread / read states (`PATCH /api/emails/:id/read`).
- Preserves inbox history across page reloads and browser sessions.

### 3. Interactive Notification Popup Window
- Glassmorphic card styling with glowing category color accents.
- Linear countdown progress bar (9.5 seconds) indicating auto-dismiss timing.
- **Hover-to-Pause**: Moving the cursor over the popup pauses the countdown timer.
- **View Email**: Opens the full email modal and reminder breakdown.
- **Reply**: Pre-fills the composer with sender address and `Re:` subject.
- **Mark Read**: Marks the email as read locally and in MongoDB.
- **Dismiss**: Closes the popup smoothly with spring exit animations.

### 4. Top-Bar Notification Center
- Header notification bell with animated unread badge counter.
- Floating dropdown drawer displaying the stream of recent real-time mail alerts.
- Filter and search alerts with 1-click actions (*Clear All*, *View*, *Settings*).

### 5. Multi-Tone Category Audio Chimes
- Generates pure harmonic tones in real-time via the Web Audio API (no external MP3 assets needed):
  - **Personal**: 👤 Smooth 3-note Harp chord.
  - **Business**: 💼 Corporate two-tone chime.
  - **Finance**: 💳 Coin shimmer arpeggio.
  - **Security**: 🚨 Dual-frequency urgent siren.
  - **School / College**: 🎓 Campus bell tone.
  - **Spam**: ⚠️ Warning low buzz.
  - **Uncategorized**: 💬 Soft pop.

### 6. Robust Email Deletion
- Optimistic instant removal from email list, notification history, active popups, and detail modals.
- Safely deletes matching documents in MongoDB.
- Automatically moves authenticated messages to Gmail Trash (`messages.trash`).
- Blacklists deleted IDs for the session to prevent ghost re-appearance.

---

## 📊 The 7 Email Categories

- **👤 Personal** (Emerald Green): Family, friends, reunion, invitations, birthday wishes.
- **💼 Business** (Indigo Blue): Client contracts, proposals, partnership agreements, invoices, corporate updates.
- **💳 Finance** (Amber Gold): Bank transactions, payments, account statements, credit card alerts.
- **🚨 Security** (Rose Red): Suspicious logins, OTP codes, password resets, verification alerts.
- **🎓 School / College** (Cyan Blue): Timetables, exam schedules, course registration, assignments, grade reports.
- **⚠️ Spam** (Purple): Lottery winnings, prize claims, promo clickbait, suspicious links.
- **📂 Uncategorized** (Slate Gray): General routine system updates and miscellaneous notices.

---

## 📋 Prerequisites

- **Node.js**: `>= 18.0.0`
- **npm**: `>= 9.0.0`
- **MongoDB**: Local MongoDB or MongoDB Atlas cluster connection string.
- **Google Cloud Console (Optional)**: OAuth Client ID and Secret for real Gmail sync.

---

## 🛠️ Step-by-Step Installation (Pointwise)

- **Step 1: Clone the repository**
  ```bash
  git clone https://github.com/Nandu-2550/CivicLink_9kis-2026.git
  cd Final-project-Email--cat-
  ```

- **Step 2: Install dependencies**
  ```bash
  npm run install-all
  ```

- **Step 3: Configure environment variables**
  - Create `server/.env`:
    ```env
    PORT=5000
    MONGO_URI=mongodb://127.0.0.1:27017/LiveMailDB
    SESSION_SECRET=livemail_dev_session_secret_key
    GMAIL_POLL_INTERVAL=25000
    GOOGLE_CLIENT_ID=your_google_client_id
    GOOGLE_CLIENT_SECRET=your_google_client_secret
    GOOGLE_REDIRECT_URI=http://localhost:5000/oauth2callback
    ```
  - Create `client/.env`:
    ```env
    REACT_APP_API_URL=http://localhost:5000
    REACT_APP_SOCKET_URL=http://localhost:5000
    PORT=3000
    ```

- **Step 4: Train the NLP Classifier & Seed Database**
  ```bash
  npm run seed
  ```

- **Step 5: Start the application**
  ```bash
  npm run dev
  ```

- **Step 6: Access Dashboard**
  - Open `http://localhost:3000` in your web browser.

---

## 🔌 API Endpoints Summary

- **`GET /api/emails`**: Fetches fresh Gmail messages, stores in MongoDB, and returns sorted mailbox.
- **`POST /api/emails/live-store`**: Directly persists incoming email objects to MongoDB and broadcasts via Socket.io.
- **`POST /api/emails/test-broadcast`**: Simulates and persists a live categorized test email (Security, Finance, etc.).
- **`PATCH /api/emails/:id/read`**: Updates email read status in MongoDB.
- **`DELETE /api/emails/:id`**: Removes email from MongoDB, session blacklist, and Gmail Trash.
- **`POST /api/emails/send`**: Sends a new email via Gmail API.
- **`GET /api/emails/stats`**: Returns category distribution and unread count totals.
- **`GET /api/health`**: Service health and uptime check.

---

## 🔌 Socket.io Events

- **`join-room`** (Client → Server): Joins user-specific notification room (`user:<email>`).
- **`new-email`** (Server → Client): Broadcasts newly received/categorized emails to connected dashboards.

---

## 🧪 Testing Live Notifications & Live Storing

- **1. Open Dashboard**: Navigate to `http://localhost:3000/dashboard`.
- **2. Click "⚡ Test Live Mail"**: Select any category (*e.g. Security Alert, Finance Transaction, Business Deliverable*).
- **3. Observe Real-Time Actions**:
  - The **Popup Notification Window** slides in from top-right with linear countdown progress.
  - The category audio chime plays immediately.
  - The notification appears in the **Notification Center Bell** dropdown with badge count.
  - The email appears in the mailbox list and is stored permanently in MongoDB.
- **4. Test Delete**: Click the trash icon on any email to verify instant deletion across the UI, notification feed, and database.

---

## 👥 Authors & License

- **License**: MIT License
- **Author**: LiveMail Classifier Development Team