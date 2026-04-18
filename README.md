# 🛡️ SACE — Sovereign Agentic Compliance Engine

**SACE** is a full-stack AI-powered compliance auditing system designed for automated extraction and verification of metrics from medical device regulatory documents (EU MDR / CER reports). It combines multimodal document embeddings (ColPali), vision-language model extraction (Gemini Flash), and a Human-in-the-Loop (HITL) validation workflow.

---

## Architecture

```
┌──────────────┐      PDF Upload       ┌──────────────────┐
│   React UI   │ ───────────────────▶  │  FastAPI Backend  │
│  (Vite)      │                       │                   │
│  Port: 5173  │ ◀──── JSON Response── │   Port: 8000      │
└──────────────┘                       └────────┬──────────┘
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          ▼                     ▼                     ▼
                  ┌──────────────┐    ┌─────────────────┐   ┌────────────────┐
                  │  ColPali API │    │  Qdrant (Local)  │   │  Gemini Flash  │
                  │  (Colab +    │    │  Vector Database │   │  Vision API    │
                  │   ngrok)     │    │  128D / MaxSim   │   │                │
                  └──────────────┘    └─────────────────┘   └────────────────┘
```

### Pipeline Flow

1. **Upload** — User uploads a PDF via the Document Library
2. **Embed** — Backend sends PDF bytes to an external ColPali API (hosted on Google Colab via ngrok) which returns multivector embeddings + base64 page images
3. **Store** — Each page is upserted into a local Qdrant database with `document_id`, `page_number`, and `image_base64` in the payload
4. **Analyze** — User enters a natural language query on the Audit Dashboard. The backend retrieves the most relevant page from Qdrant and sends the base64 image + query to Gemini Flash for extraction
5. **Validate** — The compliance officer reviews the AI extraction against the source document image side-by-side, then approves or rejects the result (HITL)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Backend | FastAPI (Python) |
| Vector DB | Qdrant (local disk mode, 128D COSINE, MultiVector MaxSim) |
| Embeddings | ColPali (multimodal document embeddings via external API) |
| Vision LLM | Google Gemini Flash (vision-language extraction) |
| Styling | Vanilla CSS (dark theme, glassmorphism) |

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Google Gemini API Key** ([Get one here](https://aistudio.google.com/apikey))
- **ColPali API** running on Google Colab with an ngrok tunnel

### 1. Clone

```bash
git clone https://github.com/KushairiNorazli/SACE-mvp.git
cd SACE-mvp
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn python-dotenv requests qdrant-client pydantic

# Create .env file
cp .env.example .env   # Or create manually (see below)
```

Create a `backend/.env` file:

```env
# Gemini Configuration
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-flash-latest"

# ColPali Embedding API (Google Colab ngrok URL)
COLPALI_API_URL="https://your-ngrok-id.ngrok-free.app/embed_pdf"
```

Start the backend:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The dashboard will be available at **http://localhost:5173**.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/upload` | Upload a PDF → embed via ColPali → store in Qdrant |
| `POST` | `/analyze` | Query a document → retrieve from Qdrant → extract via Gemini Flash |
| `POST` | `/validate` | Log HITL validation feedback (approve/reject/correct) |

---

## Project Structure

```
SACE-mvp/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── .env                 # API keys (git-ignored)
│   ├── qdrant_local_db/     # Qdrant vector storage (git-ignored)
│   └── uploads/             # Uploaded PDFs (git-ignored)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main application with routing
│   │   ├── index.css        # Global dark theme styles
│   │   └── components/
│   │       └── AuditDashboard.jsx  # Extraction + HITL validation UI
│   ├── public/
│   └── package.json
├── .gitignore
└── README.md
```

---

## Screenshots

### Audit Dashboard
The Sovereign Agentic Extraction interface where compliance officers enter natural language queries to extract metrics from uploaded regulatory documents.

### Document Library
Upload and manage EU MDR / CER PDF documents. Each upload is automatically embedded via ColPali and indexed in Qdrant.

### Human-in-the-Loop Validation
Side-by-side view of the source document page and AI-extracted data, with approve/reject controls for ground truth logging.

---

## ColPali API (Google Colab)

The external ColPali API should expose a `POST /embed_pdf` endpoint that:

- **Accepts**: A PDF file via multipart form-data (`file` field)
- **Returns**: JSON with:
  - `embeddings` — List of multivector matrices (one per page)
  - `base64_images` — List of base64-encoded JPEG strings (one per page)

---

## License

This project is for academic and research purposes.

---

> Built as an MVP for the Sovereign Agentic Compliance Engine initiative — automating EU MDR compliance auditing with multimodal AI.
