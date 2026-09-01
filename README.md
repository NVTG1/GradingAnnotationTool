# GradeSense — Grading & Annotation Tool

GradeSense is an AI-assisted grading and annotation tool that evaluates student answers against a model answer and marking rubric, provides explainable rubric-level scores, highlights mistakes, and exports an annotated PDF.

The system is designed around reliability: LLM output is treated as untrusted input and is validated before marks are stored or shown to the user.

## Features

* Upload:

  * Question paper PDF
  * Student answer PDF
  * Model answer / marking rubric PDF
* Extract text from uploaded PDFs
* Parse the model answer into structured rubric points
* Grade the student answer against each rubric point
* Display:

  * Total marks
  * Maximum marks
  * Marks for every rubric point
  * Correct / partial / missing / incorrect status
  * Evidence from the student's answer
  * Specific feedback and corrections
  * Confidence score
  * Human-review flag
* Automatically generate annotations from grading evidence
* Manually create annotations by selecting text
* Edit annotation type and feedback
* Delete annotations
* Edit annotations without triggering re-grading
* Export the current annotation state as a new PDF
* Store grading history in MongoDB
* Handle reliability scenarios such as:

  * Blank answers
  * OCR-like text errors
  * Malformed LLM output
  * LLM/API failures
  * Marks exceeding rubric limits

## Tech Stack

### Frontend

* React
* Vite
* JavaScript
* CSS

### Backend

* Node.js
* Express
* Multer
* pdf-parse
* pdf-lib
* Mongoose

### Database

* MongoDB

### AI / Grading

The application supports two LLM modes:

* `mock` — deterministic local provider used for development and testing
* `groq` — real LLM provider

The LLM provider is selected through an environment variable so the grading pipeline does not depend directly on a specific provider.

## Architecture

GradeSense follows a simple client-server architecture.

```text
                    ┌──────────────────────┐
                    │      User / Teacher  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   React + Vite UI    │
                    │                      │
                    │ Upload               │
                    │ Grading Results      │
                    │ Annotation Editor    │
                    │ History              │
                    └──────────┬───────────┘
                               │ HTTP / REST
                               ▼
              ┌──────────────────────────────────┐
              │        Node.js + Express         │
              │                                  │
              │ Upload Controller                │
              │ Grade Controller                 │
              │ Annotation Controller            │
              │ History Controller               │
              │ Export Controller                │
              └───────────────┬──────────────────┘
                              │
             ┌────────────────┼─────────────────┐
             │                │                 │
             ▼                ▼                 ▼
      ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
      │ PDF Extract │  │ Grading      │  │ Annotation   │
      │             │  │ Pipeline     │  │ Generator    │
      │ pdf-parse   │  │              │  │              │
      └─────────────┘  │ Rubric       │  └──────────────┘
                       │ Parser       │
                       │ LLM Client   │
                       │ Validator    │
                       └──────┬───────┘
                              │
                       ┌──────▼───────┐
                       │ LLM / Mock   │
                       │ Provider     │
                       └──────────────┘

                              │
                              ▼
                       ┌───────────────┐
                       │   MongoDB     │
                       │               │
                       │ Submission    │
                       │ GradingResult │
                       │ Annotation    │
                       └───────────────┘

                              │
                              ▼
                       ┌───────────────┐
                       │ PDF Exporter  │
                       │   pdf-lib     │
                       └───────────────┘
```

## Grading Flow

### 1. Upload

The teacher uploads three PDFs:

```text
Question Paper
Student Answer
Model Answer / Rubric
```

The backend validates that all required files exist, accepts only PDF files, and limits each file to 15 MB.

The text of the three documents is extracted and stored with the submission.

### 2. Rubric Parsing

The model answer is converted into structured rubric points.

Example:

```json
[
  {
    "pointId": "p1",
    "description": "Correctly explains the relevant principle",
    "maxMarks": 2
  },
  {
    "pointId": "p2",
    "description": "Provides the correct calculation",
    "maxMarks": 3
  }
]
```

The parsed rubric is cached on the submission so it does not need to be parsed again unnecessarily.

### 3. AI Grading

The grading service sends the question, model answer, rubric and student answer to the configured LLM provider.

The expected output contains one result for every rubric point:

```json
{
  "rubricPoints": [
    {
      "pointId": "p1",
      "awardedMarks": 2,
      "status": "correct",
      "evidence": "student answer evidence",
      "feedback": "Specific feedback"
    }
  ]
}
```

### 4. Deterministic Validation

The LLM output is never trusted directly.

`gradingValidator.js` validates the response before it reaches the database.

Two important rules are enforced in code:

1. Marks cannot exceed the maximum marks for a rubric point.
2. Total marks are calculated from the individual rubric-point marks.

Therefore, even if an LLM returns:

```text
awardedMarks = 999
```

for a 2-mark criterion, the backend clamps it to:

```text
awardedMarks = 2
```

The total is then calculated from the validated rubric points.

### 5. Confidence and Human Review

The system calculates confidence independently of the LLM.

Confidence is reduced when:

* LLM output had to be repaired
* awarded points have no evidence

If confidence falls below the configured threshold, the result is marked for human review.

LLM/API failure also results in a human-review flag instead of pretending that grading succeeded.

### 6. Annotation Generation

After grading, the system converts grading evidence into annotations.

The annotation is anchored using character offsets in the extracted student-answer text rather than PDF coordinates.

This allows the annotation system to remain independent of the grading result.

Examples:

```text
Correct / Partial  → Underline
Incorrect          → Strikethrough
Missing             → Comment
```

If evidence cannot be found exactly in the student answer, the system creates an unanchored comment rather than guessing the wrong location.

### 7. Editable Annotations

Annotations are stored separately from `GradingResult`.

A teacher can:

* Add an annotation
* Change its type
* Edit its note
* Change its position
* Delete it

These operations use the annotation endpoints only and do not call the grading endpoint.

Therefore, changing an annotation does not require the answer to be graded again.

### 8. PDF Export

The original student answer is never modified.

The exporter creates a new PDF using:

```text
Student Answer Text
        +
Current Annotation State
        ↓
New Annotated PDF
```

This means changes to annotations are reflected immediately when the PDF is exported.

## Backend Structure

```text
server/
└── src/
    ├── config/
    │   └── db.js
    │
    ├── controllers/
    │   ├── annotationController.js
    │   ├── exportController.js
    │   ├── gradeController.js
    │   ├── historyController.js
    │   └── uploadController.js
    │
    ├── middleware/
    │   └── errorHandler.js
    │
    ├── models/
    │   ├── Annotation.js
    │   ├── GradingResult.js
    │   ├── RubricPointSchema.js
    │   └── Submission.js
    │
    ├── routes/
    │   ├── annotations.js
    │   ├── export.js
    │   ├── grade.js
    │   ├── history.js
    │   └── upload.js
    │
    ├── services/
    │   ├── annotationGenerator.js
    │   ├── gradingService.js
    │   ├── gradingValidator.js
    │   ├── llmClient.js
    │   ├── pdfExporter.js
    │   └── rubricParser.js
    │
    ├── utils/
    │   ├── pdfExtractor.js
    │   ├── AppError.js
    │   └── asyncHandler.js
    │
    └── server.js
```

## Frontend Structure

```text
client/
└── src/
    ├── api/
    │   └── gradesenseApi.js
    │
    ├── components/
    │   ├── AnnotationEditor.jsx
    │   ├── GradingResultView.jsx
    │   ├── HistoryList.jsx
    │   ├── ScenarioPicker.jsx
    │   ├── Sidebar.jsx
    │   ├── StatusBadge.jsx
    │   └── UploadForm.jsx
    │
    ├── utils/
    │   └── textOffsets.js
    │
    ├── App.jsx
    └── main.jsx
```

## API Endpoints

| Method | Endpoint                                       | Purpose                           |
| ------ | ---------------------------------------------- | --------------------------------- |
| POST   | `/api/upload`                                  | Upload and process the three PDFs |
| POST   | `/api/grade/:submissionId`                     | Grade a submission                |
| GET    | `/api/annotations/:submissionId`               | Get annotations                   |
| POST   | `/api/annotations/:submissionId`               | Create annotation                 |
| PATCH  | `/api/annotations/:submissionId/:annotationId` | Edit annotation                   |
| DELETE | `/api/annotations/:submissionId/:annotationId` | Delete annotation                 |
| GET    | `/api/history`                                 | List previous grading results     |
| GET    | `/api/history/:id`                             | Get complete grading result       |
| GET    | `/api/export/:submissionId`                    | Export annotated PDF              |

## Data Model

### Submission

Stores:

* Uploaded PDF paths
* Extracted question text
* Extracted student answer text
* Extracted model answer text
* Parsed rubric definition

### GradingResult

Stores:

* Submission reference
* Total marks
* Maximum marks
* Per-rubric results
* Confidence
* Human-review flag
* Review reason
* LLM status
* Timestamp

### Annotation

Stores:

* Submission reference
* Annotation type
* Anchor text
* Character offsets
* Feedback/note
* Creator (`system` or `user`)
* Timestamp

Annotations intentionally reference the submission rather than the grading result. This keeps annotation editing independent from grading.

## Reliability Design

The system explicitly handles the failure cases required by the assignment.

### Blank Answer

A blank answer is handled deterministically without calling the LLM. Every rubric point receives zero marks and `missing` status.

### Malformed LLM Output

Invalid JSON or missing required fields is not trusted. The system falls back to safe rubric-point handling and flags reduced confidence / human review where appropriate.

### LLM/API Failure

The grading request does not crash the application. The result is returned as requiring human review.

### Marks Above Maximum

Marks are clamped to the rubric maximum.

### Total Marks

The total is never accepted directly from the LLM. It is calculated from validated rubric-point marks.

### Unanchored Evidence

If evidence cannot be located in the student answer, the system creates a comment instead of guessing an incorrect text location.

### Original Answer Preservation

The uploaded student answer is never modified. PDF export always creates a new annotated copy.

## Testing

The backend includes tests for:

* Fully correct answers
* Partially correct answers
* Incorrect answers
* Blank answers
* OCR-like spelling errors
* Malformed model output
* Model/API failure
* Scores exceeding the maximum

Run the tests with:

```bash
cd server
npm install
npm test
```

## Setup

### Prerequisites

* Node.js
* npm
* MongoDB

### Backend

```bash
cd server
npm install
```

Create `.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/gradesense
LLM_PROVIDER=mock
```

For the mock provider:

```env
LLM_PROVIDER=mock
```

For a real Groq provider, configure the required Groq environment variable without committing the API key to Git.

Start the backend:

```bash
npm run dev
```

The backend runs on:

```text
http://localhost:5000
```

### Frontend

In another terminal:

```bash
cd client
npm install
```

Create `.env` if required:

```env
VITE_API_BASE_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

Open the Vite URL shown in the terminal.

## Test / Demo Scenarios

The application also supports deterministic demo scenarios through the grading API, allowing reliability cases such as malformed output, API failure and over-limit marks to be demonstrated without depending on unpredictable external LLM behavior.

## Design Decisions

### Why validate LLM output?

An LLM is probabilistic and may return invalid JSON, incorrect marks or inconsistent totals. The backend therefore treats the LLM as an untrusted component and applies deterministic validation before persisting the result.

### Why store annotations separately?

Annotation editing should not cause grading to run again. Keeping annotations separate from `GradingResult` makes this separation explicit.

### Why use text offsets?

LLMs can identify relevant answer text more naturally than PDF pixel coordinates. Character offsets provide a simple anchor that can be used both by the browser annotation editor and by the PDF exporter.

### Why keep a mock LLM provider?

A deterministic provider makes reliability testing reproducible. Tests can explicitly trigger malformed output, API failure and over-limit marks without relying on an external API.

## Limitations

* The current PDF exporter reconstructs the answer as a new text-based PDF rather than preserving the exact visual layout of the uploaded answer sheet.
* Evidence anchoring is best-effort when the LLM returns paraphrased evidence rather than exact text.
* The mock provider uses a lightweight heuristic and is intended primarily for deterministic development/testing.
* Authentication and production cloud infrastructure are intentionally outside the scope of the assignment.

## Assignment Deliverables

The project is accompanied by:

1. Source code repository
2. README and setup instructions
3. Architecture explanation
4. Test cases and outputs
5. Example annotated answer paper
6. Short project demonstration video
