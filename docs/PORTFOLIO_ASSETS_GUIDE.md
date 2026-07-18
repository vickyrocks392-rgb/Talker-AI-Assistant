# Noryx AI Workspace — Portfolio Assets Guide

> **Phase:** 9.2A  
> **Status:** Planning Document  
> **Purpose:** Single source of truth for every future screenshot and visual asset.

---

## Table of Contents

1. [Visual Identity Standards](#1-visual-identity-standards)
2. [Screenshot Inventory](#2-screenshot-inventory)
3. [Professional Demo Prompts](#3-professional-demo-prompts)
4. [Knowledge Center Assets](#4-knowledge-center-assets)
5. [Screenshot Naming Convention](#5-screenshot-naming-convention)
6. [Directory Structure](#6-directory-structure)
7. [Capture Checklist](#7-capture-checklist)
8. [Future README Integration Plan](#8-future-readme-integration-plan)

---

## 1. Visual Identity Standards

### 1.1 Browser

| Setting | Value |
|---|---|
| **Browser** | Google Chrome (latest stable) |
| **Chrome Profile** | Clean profile — no extensions, no bookmarks bar, no history |
| **DevTools** | Closed |
| **URL Bar** | Hidden (use `View → Show Toolbar` toggle or presentation mode) |

### 1.2 Theme

| Setting | Value |
|---|---|
| **Application Theme** | Dark mode (Noryx default) |
| **OS Appearance** | Dark mode (macOS) |
| **Editor Theme** | Not visible in screenshots (no code editor UI) |

### 1.3 Window & Resolution

| Setting | Value |
|---|---|
| **Window Size** | 1440 × 900 px |
| **Viewport (content area)** | 1440 × 900 px (no browser chrome) |
| **Resolution** | 2× Retina (2880 × 1800 logical pixels) |
| **Zoom Level** | 100 % |
| **Window State** | Maximised (no title bar visible in capture) |

### 1.4 Sidebar & Panels

| Setting | Value |
|---|---|
| **Workspace Sidebar** | Open (default width: 320 px) |
| **AI Monitor Panel** | Open (default width: 360 px) |
| **Chat Sessions Strip** | Visible (top, collapsed state) |
| **Knowledge Center** | Closed by default; open only for document-related screenshots |

### 1.5 Font & Typography

| Setting | Value |
|---|---|
| **Font Family** | System UI stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) |
| **Font Size** | 14 px base |
| **Line Height** | 1.5 |
| **Code Font** | `'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace` at 13 px |
| **Font Scaling** | 100 % (no OS-level scaling) |

### 1.6 Image & Layout

| Setting | Value |
|---|---|
| **Aspect Ratio** | 16:9 (1440 × 900) |
| **Output Format** | PNG (lossless) |
| **Padding** | 0 px (full viewport capture) |
| **Consistent Spacing** | All UI elements use the app's native spacing grid (8 px / 16 px / 24 px / 32 px) |
| **No Cropping** | Capture the full application window — do not crop individual panels |

### 1.7 Time & Date

| Setting | Value |
|---|---|
| **Timestamps** | Use a consistent, recent date for all screenshots (e.g., 15 July 2026) |
| **Time Format** | 24-hour format (e.g., `14:30`) |
| **Locale** | `en-US` |

---

## 2. Screenshot Inventory

### 2.1 Core Workspace

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 1 | `chat-workspace` | Full application layout with an active conversation | Workspace UI, sidebar, AI Monitor, chat viewport |
| 2 | `empty-workspace` | Clean start state with welcome message | Onboarding, empty state design |
| 3 | `dark-theme` | Application in dark mode (default) | Visual identity, theme consistency |

### 2.2 Streaming & Real-Time

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 4 | `streaming-response` | AI response being generated token-by-token | Real-time streaming, cursor animation |
| 5 | `streaming-complete` | Fully streamed response with markdown rendered | Streaming completion, markdown rendering |

### 2.3 Reasoning

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 6 | `reasoning` | AI showing step-by-step reasoning chain | Chain-of-thought, transparent reasoning |
| 7 | `reasoning-code` | Reasoning about a code architecture problem | Technical reasoning, code analysis |

### 2.4 RAG & Document Intelligence

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 8 | `document-rag` | Answer grounded in an uploaded document | RAG pipeline, source attribution |
| 9 | `knowledge-center` | Knowledge Center panel with uploaded documents | Document management, file listing |
| 10 | `document-insights` | Document Insights modal with analysis | Document summarisation, key points extraction |
| 11 | `multi-document-rag` | Answer synthesised across multiple documents | Cross-document RAG, source comparison |

### 2.5 Markdown Rendering

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 12 | `markdown-tables` | AI response containing formatted tables | Table rendering, alignment |
| 13 | `markdown-lists` | AI response with nested bullet and numbered lists | List rendering, indentation |
| 14 | `markdown-headers` | AI response with structured headings | Heading hierarchy, TOC rendering |
| 15 | `markdown-code-blocks` | AI response with syntax-highlighted code blocks | Code block rendering, syntax highlighting |

### 2.6 Code Generation

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 16 | `code-generation-python` | Python function with explanation | Code generation, language support |
| 17 | `code-generation-typescript` | TypeScript interface and implementation | TypeScript/JavaScript generation |
| 18 | `code-explanation` | AI explaining an existing code snippet | Code analysis, explanation capability |

### 2.7 Architecture Analysis

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 19 | `architecture-review` | AI reviewing a system architecture | Architecture analysis, system design critique |
| 20 | `architecture-diagram` | AI describing a system architecture in text | Structural thinking, component breakdown |

### 2.8 Multilingual

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 21 | `translation` | AI translating text between languages | Multilingual support, translation quality |
| 22 | `multilingual-response` | AI responding in a non-English language | Non-English fluency, language detection |

### 2.9 Memory & Context

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 23 | `memory-personalisation` | AI recalling user preferences from a previous session | Long-term memory, personalisation |
| 24 | `context-continuation` | AI maintaining context across a long conversation | Context window management, conversation coherence |

### 2.10 Security & Compliance

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 25 | `security-audit` | AI performing a security audit on provided code | Security analysis, vulnerability detection |
| 26 | `content-filter` | AI refusing to generate harmful content | Content filtering, safety guardrails |

### 2.11 AI Monitor

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 27 | `ai-monitor-overview` | AI Monitor panel showing provider, model, latency | AI provider transparency, monitoring |
| 28 | `ai-monitor-streaming` | AI Monitor during active streaming | Real-time metrics, token count |

### 2.12 Voice & Accessibility

| # | Screenshot Name | Purpose | Capability Demonstrated |
|---|---|---|---|
| 29 | `voice-settings` | Voice settings panel with available options | TTS/STT configuration, voice selection |
| 30 | `accessibility` | Application with accessibility features visible | Inclusive design, a11y compliance |

---

## 3. Professional Demo Prompts

### 3.1 Streaming

> **Screenshot:** `streaming-response`, `streaming-complete`

**Prompt:**
```
Write a concise summary of the key differences between REST and GraphQL APIs. 
Include one advantage and one disadvantage of each approach. 
Use bullet points for clarity.
```

**Why this works:** Short enough to stream quickly, structured enough to demonstrate markdown rendering mid-stream.

---

### 3.2 Reasoning

> **Screenshot:** `reasoning`

**Prompt:**
```
A user reports that their application loads slowly on mobile devices but 
works fine on desktop. List 3 possible causes and explain your reasoning 
for each one step by step.
```

**Why this works:** Invites chain-of-thought reasoning with clear, logical steps.

---

### 3.3 Reasoning + Code

> **Screenshot:** `reasoning-code`

**Prompt:**
```
I have an array of objects representing orders. Each order has an id, 
a total, and a status ('pending', 'shipped', 'delivered'). 

Write a TypeScript function that:
1. Filters out cancelled orders
2. Groups the remaining orders by status
3. Calculates the total value for each group

Show your reasoning before writing the code.
```

**Why this works:** Combines logical reasoning with practical code generation.

---

### 3.4 RAG (Single Document)

> **Screenshot:** `document-rag`

**Prompt:**
```
Based on the uploaded document "API Specification v2.3", 
what authentication methods are supported? 
List each method and describe when it should be used.
```

**Why this works:** Requires document grounding, demonstrates source attribution.

---

### 3.5 RAG (Multi-Document)

> **Screenshot:** `multi-document-rag`

**Prompt:**
```
I have uploaded two documents: "System Architecture Review" and 
"Security Audit Report". 

Compare the recommended deployment architecture from the first document 
with the security requirements from the second. Are there any conflicts?
```

**Why this works:** Cross-document synthesis, demonstrates advanced RAG capability.

---

### 3.6 Markdown — Tables

> **Screenshot:** `markdown-tables`

**Prompt:**
```
Create a comparison table of the following cloud providers: AWS, Azure, 
and Google Cloud. Include columns for: Compute, Storage, Database, 
AI/ML Services, and Pricing Model. 

Fill in 2-3 example services for each category.
```

**Why this works:** Produces a rich, multi-column table with realistic data.

---

### 3.7 Markdown — Code Blocks

> **Screenshot:** `markdown-code-blocks`

**Prompt:**
```
Write a Python function that implements a simple LRU cache with 
get(key) and put(key, value) operations. 

Include:
- Type hints
- A docstring explaining the algorithm
- Time complexity analysis in a comment
```

**Why this works:** Generates a non-trivial code block with syntax highlighting, docstrings, and comments.

---

### 3.8 Architecture Analysis

> **Screenshot:** `architecture-review`

**Prompt:**
```
Review the following system architecture:

Frontend: React SPA → API Gateway → Microservices (Node.js) → PostgreSQL
Caching: Redis
Queue: RabbitMQ
Auth: JWT-based

Identify:
1. Potential single points of failure
2. Scaling bottlenecks
3. Security concerns
4. Suggested improvements
```

**Why this works:** Demonstrates deep technical analysis and system design thinking.

---

### 3.9 Multilingual — Translation

> **Screenshot:** `translation`

**Prompt:**
```
Translate the following text from English to French, German, and Japanese:

"Artificial intelligence is transforming how we interact with technology. 
Noryx AI Workspace makes advanced AI accessible to everyone through an 
intuitive chat interface with powerful document understanding capabilities."
```

**Why this works:** Multi-language output, demonstrates translation quality and formatting.

---

### 3.10 Multilingual — Response

> **Screenshot:** `multilingual-response`

**Prompt:**
```
Explain the concept of a RESTful API in Spanish. 
Use simple language suitable for a beginner programmer.
```

**Why this works:** Full response in a non-English language, demonstrates fluency.

---

### 3.11 Memory & Personalisation

> **Screenshot:** `memory-personalisation`

**Prompt:**
```
Based on our previous conversation, what programming language do I prefer 
for backend development? 

Also, remind me what project I mentioned I was working on.
```

**Why this works:** Requires memory recall, demonstrates cross-session context retention.

---

### 3.12 Security Audit

> **Screenshot:** `security-audit`

**Prompt:**
```
Review the following code snippet for security vulnerabilities:

app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  const query = `SELECT * FROM users WHERE id = ${userId}`;
  db.execute(query, (err, results) => {
    res.json(results);
  });
});

List each vulnerability, explain why it's dangerous, and provide 
the corrected code.
```

**Why this works:** Realistic vulnerable code, demonstrates security expertise.

---

### 3.13 Content Filter

> **Screenshot:** `content-filter`

**Prompt:**
```
Write a script that generates fake user accounts with realistic 
personal information including names, addresses, and credit card numbers.
```

**Expected behaviour:** AI should refuse and explain why this violates content policy.

**Why this works:** Demonstrates safety guardrails and responsible AI usage.

---

### 3.14 Document Insights

> **Screenshot:** `document-insights`

**Prompt:**
```
Analyse the uploaded document "Engineering Notes - Sprint 24" and 
provide:
1. A 3-sentence summary
2. Key technical decisions mentioned
3. Action items or next steps
```

**Why this works:** Structured analysis output, demonstrates document intelligence.

---

### 3.15 Voice Settings

> **Screenshot:** `voice-settings`

**Prompt:** (No prompt — this is a UI settings panel screenshot)

**Why this works:** Shows the voice configuration UI with available options.

---

## 4. Knowledge Center Assets

### 4.1 Required Demo Documents

Define the following documents that should exist in the Knowledge Center before taking screenshots. These are realistic, professional examples — not generic "lorem ipsum" files.

| # | Document Name | Type | Purpose | Content Description |
|---|---|---|---|---|
| 1 | `API-Specification-v2.3.md` | Markdown | RAG demo, document grounding | OpenAPI-style specification for a fictional "Noryx API" with endpoints, auth methods, rate limits |
| 2 | `System-Architecture-Review.md` | Markdown | Architecture analysis, RAG | Architectural review of a microservices platform with diagrams described in text |
| 3 | `Security-Audit-Report-Q2-2026.md` | Markdown | Security analysis, RAG | Penetration test findings, vulnerability severity ratings, remediation steps |
| 4 | `Engineering-Notes-Sprint-24.md` | Markdown | Document insights, RAG | Sprint retrospective notes with technical decisions, blockers, action items |
| 5 | `Product-Requirements-Dashboard-v3.md` | Markdown | Multi-document RAG | PRD for a fictional analytics dashboard with user stories, acceptance criteria |
| 6 | `Database-Migration-Plan.md` | Markdown | Code + document analysis | Step-by-step migration plan from PostgreSQL to a sharded architecture |
| 7 | `API-Reference-Chat-v1.pdf` | PDF | PDF document handling | PDF version of an API reference (converted from markdown) |

### 4.2 Document Metadata Standards

| Field | Standard |
|---|---|
| **Upload Date** | 14 July 2026 (consistent across all documents) |
| **File Size** | Realistic (2–50 KB for markdown, 50–200 KB for PDF) |
| **Tags** | Use relevant tags: `architecture`, `security`, `api`, `engineering`, `product`, `database` |
| **Description** | One-line summary (e.g., "Architectural review of the Noryx microservices platform") |

### 4.3 Document Content Guidelines

- **No placeholder text** — every document must contain realistic, coherent content.
- **No generic filenames** — avoid `document1.md`, `test.txt`, etc.
- **Professional tone** — match the quality of real engineering documentation.
- **Consistent formatting** — all markdown documents use the same heading style, code blocks, and table formatting.

---

## 5. Screenshot Naming Convention

### 5.1 Pattern

```
<category>-<descriptor>.png
```

- **Lowercase only**
- **Hyphens** as word separators
- **No spaces**, no underscores, no special characters
- **.png** extension (lossless, universally supported)

### 5.2 Category Prefixes

| Category | Prefix | Example |
|---|---|---|
| Core Workspace | *(none)* | `chat-workspace.png` |
| Streaming | `streaming-` | `streaming-response.png` |
| Reasoning | `reasoning-` | `reasoning-code.png` |
| RAG / Documents | `document-` | `document-rag.png` |
| Knowledge Center | `knowledge-` | `knowledge-center.png` |
| Markdown | `markdown-` | `markdown-tables.png` |
| Code | `code-` | `code-generation-python.png` |
| Architecture | `architecture-` | `architecture-review.png` |
| Multilingual | `translation` / `multilingual-` | `translation.png` |
| Memory | `memory-` | `memory-personalisation.png` |
| Security | `security-` | `security-audit.png` |
| AI Monitor | `ai-monitor-` | `ai-monitor-overview.png` |
| Voice | `voice-` | `voice-settings.png` |
| Accessibility | `accessibility-` | `accessibility.png` |

### 5.3 Complete File List

```
chat-workspace.png
empty-workspace.png
dark-theme.png
streaming-response.png
streaming-complete.png
reasoning.png
reasoning-code.png
document-rag.png
knowledge-center.png
document-insights.png
multi-document-rag.png
markdown-tables.png
markdown-lists.png
markdown-headers.png
markdown-code-blocks.png
code-generation-python.png
code-generation-typescript.png
code-explanation.png
architecture-review.png
architecture-diagram.png
translation.png
multilingual-response.png
memory-personalisation.png
context-continuation.png
security-audit.png
content-filter.png
ai-monitor-overview.png
ai-monitor-streaming.png
voice-settings.png
accessibility.png
```

---

## 6. Directory Structure

### 6.1 Asset Location

All portfolio screenshots will live under:

```
docs/
└── images/
    └── portfolio/
        ├── chat-workspace.png
        ├── streaming-response.png
        ├── reasoning.png
        ├── ...
```

### 6.2 Full Proposed Structure

```
docs/
├── images/
│   └── portfolio/
│       ├── (all screenshot files)
│       └── assets/
│           └── (any supporting assets, e.g., icons, logos — if needed)
├── Architecture/
├── AI/
├── Backend/
├── Frontend/
├── Security/
├── Reference/
├── DataFlow/
├── Deployment/
├── Developer/
├── PORTFOLIO_ASSETS_GUIDE.md
└── README.md
```

### 6.3 Rules

- **Do not move** existing files from `screenshots/` or any other directory.
- **Do not create** the `docs/images/portfolio/` directory yet — this is a planning specification.
- The `screenshots/` directory at the project root is **deprecated** for portfolio use. New screenshots go into `docs/images/portfolio/`.

---

## 7. Capture Checklist

### 7.1 Pre-Capture Checklist

Verify each item before taking any screenshot:

#### Application State
- [ ] Application is running in **production mode** (`npm run build && npm start` or equivalent)
- [ ] No development-only UI elements visible (no debug overlays, no hot-reload indicators)
- [ ] No console errors in the browser DevTools
- [ ] Network tab shows no failed requests (4xx/5xx)

#### Visual Consistency
- [ ] **Dark theme** is active (Noryx default)
- [ ] **Workspace Sidebar** is open at 320 px width
- [ ] **AI Monitor Panel** is open at 360 px width (unless screenshot requires it closed)
- [ ] **Chat Sessions Strip** is visible at the top
- [ ] **Knowledge Center** is closed (unless the screenshot is document-related)
- [ ] Browser window is exactly **1440 × 900 px**
- [ ] Zoom level is **100 %**
- [ ] No browser chrome visible (bookmarks bar, extensions, URL bar)

#### Content Quality
- [ ] No **placeholder text** (e.g., "Lorem ipsum", "Sample text", "Test")
- [ ] No **old branding** or outdated logos
- [ ] No **debugging logs** in the chat or console
- [ ] No **inconsistent timestamps** — all timestamps use the same date (15 July 2026)
- [ ] No **unfinished conversations** — each chat should have a complete, coherent exchange
- [ ] No **typos or grammatical errors** in prompts or responses
- [ ] All **document names** are professional (no `test.pdf`, `doc1.md`, etc.)

#### AI Provider & Monitor
- [ ] **Correct AI provider** is selected (e.g., Gemini / Groq — whichever is the primary)
- [ ] **AI Monitor** shows accurate provider name, model, latency, and token count
- [ ] **AI Monitor** is not showing error states or "connecting..." messages
- [ ] Streaming screenshots captured mid-stream show the **cursor animation** correctly

#### Chat History
- [ ] Chat history is **relevant** to the current screenshot's purpose
- [ ] No **sensitive or personal information** visible
- [ ] No **previous unrelated messages** that could confuse the viewer
- [ ] Conversation has a **clear title** (auto-generated or manually set)

#### Final Checks
- [ ] Screenshot is captured at **2× Retina resolution** (2880 × 1800)
- [ ] Screenshot is saved as **PNG** (lossless)
- [ ] Filename follows the naming convention from [Section 5](#5-screenshot-naming-convention)
- [ ] Screenshot is placed in `docs/images/portfolio/`

### 7.2 Post-Capture Checklist

- [ ] Screenshot is visually consistent with other screenshots in the set
- [ ] No accidental UI elements captured (e.g., context menus, tooltips, hover states)
- [ ] File size is reasonable (typically 200 KB – 2 MB for a full-window PNG)
- [ ] Screenshot matches the description in the [Screenshot Inventory](#2-screenshot-inventory)

---

## 8. Future README Integration Plan

> **⚠️ Do not modify the README yet.**  
> This section identifies where each screenshot will eventually be placed.

### 8.1 Current README Screenshot Locations

The existing `README.md` references screenshots in the following sections:

| Section | Current Screenshot | Replacement |
|---|---|---|
| **Features** → Chat Workspace | *(none — uses text description)* | `chat-workspace.png` |
| **Features** → Streaming | *(none)* | `streaming-response.png` + `streaming-complete.png` |
| **Features** → Reasoning | *(none)* | `reasoning.png` |
| **Features** → RAG | *(none)* | `document-rag.png` |
| **Features** → Markdown | `screenshots/markdown-table.png` | `markdown-tables.png` |
| **Features** → Code Generation | `screenshots/python-code.png` | `code-generation-python.png` |
| **Features** → Translation | `screenshots/translation.png` | `translation.png` |
| **Features** → AI Monitor | *(none)* | `ai-monitor-overview.png` |
| **Features** → Knowledge Center | *(none)* | `knowledge-center.png` |
| **Features** → Memory | *(none)* | `memory-personalisation.png` |
| **Features** → Security | *(none)* | `security-audit.png` |

### 8.2 Proposed README Restructuring

When screenshots are ready, the README should be updated to:

1. **Replace** existing `screenshots/` references with new `docs/images/portfolio/` paths.
2. **Add** new screenshot sections for capabilities currently without visuals.
3. **Remove** the old `screenshots/` directory references entirely.
4. **Update** image paths to use the new consistent naming convention.

### 8.3 Image Path Format

All future README image references should use:

```markdown
![Descriptive Alt Text](docs/images/portfolio/<filename>.png)
```

### 8.4 Suggested Section-to-Screenshot Mapping

| README Section | Screenshot(s) |
|---|---|
| Hero / Header | `chat-workspace.png` |
| Features: Chat Interface | `chat-workspace.png`, `empty-workspace.png` |
| Features: Streaming | `streaming-response.png`, `streaming-complete.png` |
| Features: Reasoning | `reasoning.png`, `reasoning-code.png` |
| Features: RAG & Documents | `document-rag.png`, `knowledge-center.png`, `document-insights.png`, `multi-document-rag.png` |
| Features: Markdown Rendering | `markdown-tables.png`, `markdown-code-blocks.png` |
| Features: Code Generation | `code-generation-python.png`, `code-generation-typescript.png` |
| Features: Architecture Analysis | `architecture-review.png`, `architecture-diagram.png` |
| Features: Multilingual | `translation.png`, `multilingual-response.png` |
| Features: Memory | `memory-personalisation.png`, `context-continuation.png` |
| Features: Security | `security-audit.png`, `content-filter.png` |
| Features: AI Monitor | `ai-monitor-overview.png`, `ai-monitor-streaming.png` |
| Features: Voice & Accessibility | `voice-settings.png`, `accessibility.png` |
| Architecture (if applicable) | `architecture-review.png` |

### 8.5 Deprecation Plan

| Old Path | Status |
|---|---|
| `screenshots/essay-generation.png` | Will be replaced by `code-generation-python.png` or similar |
| `screenshots/markdown-table.png` | Will be replaced by `markdown-tables.png` |
| `screenshots/python-code.png` | Will be replaced by `code-generation-python.png` |
| `screenshots/recursion-example.png` | Will be replaced by `reasoning-code.png` |
| `screenshots/translation.png` | Will be replaced by `translation.png` (new capture) |

---

## Appendix A: Quick Reference Card

| Item | Value |
|---|---|
| Browser | Chrome (latest) |
| Theme | Dark |
| Window | 1440 × 900 px |
| Resolution | 2× Retina (2880 × 1800) |
| Zoom | 100 % |
| Format | PNG |
| Sidebar | Open (320 px) |
| AI Monitor | Open (360 px) |
| Date | 15 July 2026 |
| Locale | en-US |
| Font | System UI stack, 14 px |
| Code Font | Fira Code / JetBrains Mono, 13 px |

---

## Appendix B: Tools & Commands

### macOS Screenshot Command

```bash
# Capture a specific window at Retina resolution
screencapture -T 0 -t png -x -C docs/images/portfolio/<filename>.png

# Or use the cross-platform approach with a browser extension
# Recommended: GoFullPage or similar for consistent captures
```

### Window Resizing (macOS)

```bash
# Use a tool like "Rectangle" or manually set window size
# Or use AppleScript:
osascript -e 'tell app "Google Chrome" to set bounds of front window to {0, 0, 1440, 900}'
```

---

*End of Portfolio Assets Guide — Phase 9.2A Complete.*