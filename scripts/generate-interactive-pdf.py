#!/usr/bin/env python
"""Generate the interactive urbandictmcp feature and workflow guide."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
PDF_PATH = OUT_DIR / "urbandictmcp-interactive-guide.pdf"

PAGE_W, PAGE_H = letter
MARGIN = 0.55 * inch
CONTENT_W = PAGE_W - 2 * MARGIN
TOP = PAGE_H - MARGIN
BOTTOM = MARGIN

INK = colors.HexColor("#172026")
MUTED = colors.HexColor("#5c6972")
LINE = colors.HexColor("#d8e0e3")
PANEL = colors.HexColor("#f7faf9")
BLUE = colors.HexColor("#2364aa")
GREEN = colors.HexColor("#2f855a")
GOLD = colors.HexColor("#b7791f")
RED = colors.HexColor("#b83232")
PLUM = colors.HexColor("#6b46c1")
CYAN = colors.HexColor("#0e7490")
BG = colors.HexColor("#fbfcfb")
WHITE = colors.white


try:
    pdfmetrics.registerFont(TTFont("Inter", "C:/Windows/Fonts/arial.ttf"))
    pdfmetrics.registerFont(TTFont("InterBold", "C:/Windows/Fonts/arialbd.ttf"))
    FONT = "Inter"
    FONT_BOLD = "InterBold"
except Exception:
    FONT = "Helvetica"
    FONT_BOLD = "Helvetica-Bold"


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        "BodySmall",
        parent=styles["BodyText"],
        fontName=FONT,
        fontSize=8.8,
        leading=12,
        textColor=INK,
        spaceAfter=0,
    )
)
styles.add(
    ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName=FONT,
        fontSize=10,
        leading=14,
        textColor=INK,
        spaceAfter=0,
    )
)
styles.add(
    ParagraphStyle(
        "Tiny",
        parent=styles["BodyText"],
        fontName=FONT,
        fontSize=7.2,
        leading=9.2,
        textColor=MUTED,
        spaceAfter=0,
    )
)


@dataclass(frozen=True)
class Section:
    key: str
    title: str
    page: int
    color: colors.Color


SECTIONS = [
    Section("feature_map", "Feature Map", 2, BLUE),
    Section("workflow", "End-to-End Flow", 3, GREEN),
    Section("examples", "Real Examples", 4, GOLD),
    Section("shipmb", "ShipMBCompiler", 6, PLUM),
    Section("operate", "Operate & Test", 7, CYAN),
    Section("guardrails", "Guardrails", 8, RED),
    Section("appendix", "Appendix", 9, MUTED),
]


def clean_text(text: str) -> str:
    return (
        text.replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


def para(c: canvas.Canvas, text: str, x: float, y: float, w: float, style_name: str = "Body") -> float:
    p = Paragraph(clean_text(text), styles[style_name])
    _, h = p.wrap(w, 1000)
    p.drawOn(c, x, y - h)
    return y - h


def text(c: canvas.Canvas, s: str, x: float, y: float, size: float = 10, color=INK, bold: bool = False):
    c.setFont(FONT_BOLD if bold else FONT, size)
    c.setFillColor(color)
    c.drawString(x, y, clean_text(s))


def right_text(c: canvas.Canvas, s: str, x: float, y: float, size: float = 10, color=INK, bold: bool = False):
    c.setFont(FONT_BOLD if bold else FONT, size)
    c.setFillColor(color)
    c.drawRightString(x, y, clean_text(s))


def pill(c: canvas.Canvas, label: str, x: float, y: float, w: float, h: float, fill, stroke=None, label_color=INK):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.roundRect(x, y, w, h, 6, stroke=1 if stroke else 0, fill=1)
    c.setFont(FONT_BOLD, 8)
    c.setFillColor(label_color)
    c.drawCentredString(x + w / 2, y + h / 2 - 3, clean_text(label))


def card(c: canvas.Canvas, x: float, y: float, w: float, h: float, title: str, body: str, accent=BLUE):
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, h, 6, stroke=1, fill=1)
    c.setFillColor(accent)
    c.roundRect(x, y + h - 9, w, 9, 6, stroke=0, fill=1)
    text(c, title, x + 14, y + h - 28, 11, INK, True)
    para(c, body, x + 14, y + h - 42, w - 28, "BodySmall")


def code_box(c: canvas.Canvas, x: float, y: float, w: float, h: float, lines: list[str], title: str | None = None):
    c.setFillColor(colors.HexColor("#101820"))
    c.setStrokeColor(colors.HexColor("#101820"))
    c.roundRect(x, y, w, h, 6, stroke=0, fill=1)
    if title:
        pill(c, title, x + 10, y + h - 24, 94, 16, colors.HexColor("#d6f1ff"), label_color=colors.HexColor("#113449"))
    c.setFillColor(colors.HexColor("#e6f0ef"))
    c.setFont("Courier", 7.4)
    line_y = y + h - (40 if title else 18)
    for line in lines:
        c.drawString(x + 12, line_y, clean_text(line))
        line_y -= 10


def arrow(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float, color=INK):
    c.setStrokeColor(color)
    c.setLineWidth(1.4)
    c.line(x1, y1, x2, y2)
    c.setFillColor(color)
    if x2 >= x1:
        pts = [(x2, y2), (x2 - 7, y2 + 4), (x2 - 7, y2 - 4)]
    else:
        pts = [(x2, y2), (x2 + 7, y2 + 4), (x2 + 7, y2 - 4)]
    p = c.beginPath()
    p.moveTo(*pts[0])
    p.lineTo(*pts[1])
    p.lineTo(*pts[2])
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def page_bg(c: canvas.Canvas, page_no: int, title: str):
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 17)
    c.drawString(MARGIN, TOP - 8, clean_text(title))
    c.setStrokeColor(LINE)
    c.line(MARGIN, TOP - 21, PAGE_W - MARGIN, TOP - 21)
    footer(c, page_no)


def footer(c: canvas.Canvas, page_no: int):
    c.setStrokeColor(LINE)
    c.line(MARGIN, BOTTOM - 10, PAGE_W - MARGIN, BOTTOM - 10)
    text(c, "urbandictmcp interactive guide", MARGIN, BOTTOM - 26, 7.5, MUTED)
    right_text(c, f"{page_no}", PAGE_W - MARGIN, BOTTOM - 26, 7.5, MUTED)
    nav_w = 58
    x = MARGIN + 160
    for sec in SECTIONS:
        if x + nav_w > PAGE_W - MARGIN - 35:
            break
        c.setFillColor(colors.HexColor("#eef3f4"))
        c.setStrokeColor(LINE)
        c.roundRect(x, BOTTOM - 31, nav_w, 15, 4, stroke=1, fill=1)
        c.setFont(FONT_BOLD, 5.8)
        c.setFillColor(MUTED)
        c.drawCentredString(x + nav_w / 2, BOTTOM - 26, sec.title[:13])
        c.linkRect("", sec.key, (x, BOTTOM - 31, x + nav_w, BOTTOM - 16), relative=0, thickness=0)
        x += nav_w + 4


def dest(c: canvas.Canvas, key: str):
    c.bookmarkPage(key)
    for sec in SECTIONS:
        if sec.key == key:
            c.addOutlineEntry(sec.title, key, level=0, closed=False)


def linked_button(c: canvas.Canvas, label: str, key: str, x: float, y: float, w: float, h: float, fill):
    c.setFillColor(fill)
    c.setStrokeColor(fill)
    c.roundRect(x, y, w, h, 6, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 9)
    c.drawCentredString(x + w / 2, y + h / 2 - 3, clean_text(label))
    c.linkRect("", key, (x, y, x + w, y + h), relative=0, thickness=0)


def external_button(c: canvas.Canvas, label: str, url: str, x: float, y: float, w: float, h: float, fill):
    c.setFillColor(fill)
    c.setStrokeColor(fill)
    c.roundRect(x, y, w, h, 6, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 9)
    c.drawCentredString(x + w / 2, y + h / 2 - 3, clean_text(label))
    c.linkURL(url, (x, y, x + w, y + h), relative=0)


def cover(c: canvas.Canvas):
    c.bookmarkPage("cover")
    c.addOutlineEntry("Start", "cover", level=0, closed=False)
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    c.setFillColor(colors.HexColor("#e8f4f8"))
    c.circle(PAGE_W - 90, PAGE_H - 90, 115, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#edf8ef"))
    c.circle(95, 120, 85, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 35)
    c.drawString(MARGIN, TOP - 60, "urbandictmcp")
    c.setFont(FONT_BOLD, 17)
    c.setFillColor(BLUE)
    c.drawString(MARGIN, TOP - 88, "Interactive feature guide and workflow playbook")
    y = TOP - 125
    y = para(
        c,
        "A dependency-free Model Context Protocol server for Urban Dictionary lookups. It exposes slang and internet-language evidence to MCP clients through typed tool calls, structured results, and clear provenance warnings.",
        MARGIN,
        y,
        CONTENT_W * 0.74,
        "Body",
    )

    y -= 25
    linked_button(c, "Explore Features", "feature_map", MARGIN, y - 30, 105, 28, BLUE)
    linked_button(c, "See Workflows", "workflow", MARGIN + 116, y - 30, 105, 28, GREEN)
    linked_button(c, "ShipMB Bridge", "shipmb", MARGIN + 232, y - 30, 105, 28, PLUM)

    x0 = MARGIN
    y0 = 238
    box_w = (CONTENT_W - 28) / 3
    card(c, x0, y0, box_w, 102, "Define", "Look up a word or phrase, limit results, and sort by top vote score, recent date, or original API order.", BLUE)
    card(c, x0 + box_w + 14, y0, box_w, 102, "Random", "Fetch random definitions for exploration, data samples, demos, or language-discovery interfaces.", GOLD)
    card(c, x0 + 2 * (box_w + 14), y0, box_w, 102, "Definition ID", "Retrieve one exact Urban Dictionary entry by defid so examples remain stable and citeable.", GREEN)

    code_box(
        c,
        MARGIN,
        88,
        CONTENT_W,
        105,
        [
            'client -> tools/call: {"name":"urban_dictionary_define",',
            '  "arguments":{"term":"rizz","limit":3,"sort_by":"top"}}',
            "server -> content: readable text summary",
            "server -> structuredContent: definitions, scores, dates, links, defids",
        ],
        "MCP exchange",
    )


def feature_map(c: canvas.Canvas):
    dest(c, "feature_map")
    page_bg(c, 2, "Feature Map")
    y = TOP - 50
    para(
        c,
        "urbandictmcp is intentionally small: one Node.js file, no runtime package dependencies, and three tools that convert Urban Dictionary JSON into MCP-friendly text plus structured data.",
        MARGIN,
        y,
        CONTENT_W,
    )
    x = MARGIN
    y_cards = 500
    w = (CONTENT_W - 24) / 3
    card(c, x, y_cards, w, 160, "urban_dictionary_define", "<b>Input:</b> term, limit, sort_by<br/><br/><b>Use when:</b> a user asks what slang means or an app needs ranked candidates for a phrase.<br/><br/><b>Output:</b> definitions, examples, votes, author, date, permalink, defid.", BLUE)
    card(c, x + w + 12, y_cards, w, 160, "urban_dictionary_random", "<b>Input:</b> limit<br/><br/><b>Use when:</b> building demos, browsing slang, testing UI states, or collecting unpredictable language examples.<br/><br/><b>Output:</b> normalized definitions with the same fields.", GOLD)
    card(c, x + 2 * (w + 12), y_cards, w, 160, "urban_dictionary_defid", "<b>Input:</b> defid<br/><br/><b>Use when:</b> an app needs one stable entry for traceability, replay, or examples in docs.<br/><br/><b>Output:</b> one normalized definition.", GREEN)

    y = 448
    text(c, "Data Shape", MARGIN, y, 12, INK, True)
    labels = ["word", "definition", "example", "thumbs_up", "thumbs_down", "score", "written_on", "permalink", "defid"]
    x = MARGIN
    y -= 34
    for i, label in enumerate(labels):
        col = [BLUE, GREEN, GOLD, CYAN, PLUM, RED, MUTED, BLUE, GREEN][i]
        pill(c, label, x, y, 85, 20, colors.Color(col.red, col.green, col.blue, alpha=0.12), stroke=col, label_color=INK)
        x += 95
        if x + 85 > PAGE_W - MARGIN:
            x = MARGIN
            y -= 29

    text(c, "Why Structured Content Matters", MARGIN, 302, 12, INK, True)
    card(c, MARGIN, 170, CONTENT_W / 2 - 8, 110, "Readable for people", "The `content` field gives the MCP client a formatted text answer that can be shown directly in chat or logs.", CYAN)
    card(c, MARGIN + CONTENT_W / 2 + 8, 170, CONTENT_W / 2 - 8, 110, "Usable by systems", "The `structuredContent` field lets downstream code rank, filter, cite, summarize, transform, or pass slang evidence into another reasoning layer.", PLUM)


def workflow(c: canvas.Canvas):
    dest(c, "workflow")
    page_bg(c, 3, "End-to-End Flow")
    x = MARGIN
    step_w = 150
    step_h = 84
    gap = 21
    y_top = 600
    y_bottom = 424
    positions = [
        (x, y_top, "MCP client", "Launches `node server.js` over stdio and sends `initialize`.", BLUE),
        (x + step_w + gap, y_top, "Tool discovery", "Client calls `tools/list` and receives schemas for define, random, and defid.", GREEN),
        (x + 2 * (step_w + gap), y_top, "User intent", "User asks about a slang term, an ID, or random examples.", GOLD),
        (x, y_bottom, "Urban API", "Server calls `/define`, `/define?defid=`, or `/random` with timeout controls.", CYAN),
        (x + step_w + gap, y_bottom, "Normalize", "Bracket links are cleaned; votes become scores; dates and permalinks are preserved.", PLUM),
        (x + 2 * (step_w + gap), y_bottom, "Return", "Client receives readable content plus structured content for automation.", RED),
    ]
    for bx, by, title, body, col in positions:
        card(c, bx, by, step_w, step_h, title, body, col)
    arrow(c, x + step_w + 2, y_top + step_h / 2, x + step_w + gap - 5, y_top + step_h / 2, MUTED)
    arrow(c, x + 2 * step_w + gap + 2, y_top + step_h / 2, x + 2 * (step_w + gap) - 5, y_top + step_h / 2, MUTED)
    arrow(c, x + 2 * (step_w + gap) + step_w / 2, y_top - 5, x + step_w / 2, y_bottom + step_h + 5, MUTED)
    arrow(c, x + step_w + 2, y_bottom + step_h / 2, x + step_w + gap - 5, y_bottom + step_h / 2, MUTED)
    arrow(c, x + 2 * step_w + gap + 2, y_bottom + step_h / 2, x + 2 * (step_w + gap) - 5, y_bottom + step_h / 2, MUTED)

    text(c, "Call Path Snapshot", MARGIN, 360, 12, INK, True)
    code_box(
        c,
        MARGIN,
        196,
        CONTENT_W,
        145,
        [
            '1  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}',
            '2  {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}',
            '3  {"jsonrpc":"2.0","id":3,"method":"tools/call",',
            '4    "params":{"name":"urban_dictionary_define",',
            '5      "arguments":{"term":"mid","limit":3,"sort_by":"recent"}}}',
            "6  response.content[0].text -> ready for conversation",
            "7  response.structuredContent.definitions -> ready for ranking and integration",
        ],
        "JSON-RPC over stdio",
    )
    para(
        c,
        "The important design choice is separation: chat-friendly text stays easy to read, while the structured object preserves the evidence needed by compilers, agents, dashboards, and filters.",
        MARGIN,
        160,
        CONTENT_W,
        "Body",
    )


def examples(c: canvas.Canvas):
    dest(c, "examples")
    page_bg(c, 4, "Real-World Examples")
    w = (CONTENT_W - 16) / 2
    card(c, MARGIN, 578, w, 118, "1. Social listening triage", "A brand dashboard sees: `this launch is mid`. The client calls define(term=`mid`, sort_by=`top`) and shows analysts likely meanings, examples, vote scores, and source links before deciding sentiment.", BLUE)
    card(c, MARGIN + w + 16, 578, w, 118, "2. Support desk translation", "A support agent receives slang-heavy feedback. The assistant can fetch definitions, warn that they are crowdsourced, and rewrite a concise neutral interpretation for internal notes.", GREEN)
    card(c, MARGIN, 430, w, 118, "3. Creative writing helper", "A writer asks whether a line sounds current. The client compares top and recent definitions, checks examples, and suggests whether the phrase feels dated, niche, or broad.", GOLD)
    card(c, MARGIN + w + 16, 430, w, 118, "4. Education and media literacy", "A classroom tool can explain internet slang while preserving caveats: this is cultural evidence, not a formal dictionary, and entries may be explicit or wrong.", PLUM)

    text(c, "Example Decision Loop", MARGIN, 362, 12, INK, True)
    items = [
        ("Ask", "What does this phrase appear to mean here?"),
        ("Lookup", "Call define, use top or recent depending on the question."),
        ("Inspect", "Read examples, votes, dates, links, and competing definitions."),
        ("Ground", "Cite the defid or permalink when the result affects a decision."),
        ("Act", "Summarize cautiously, filter explicit text, or route to human review."),
    ]
    x = MARGIN
    y = 296
    for idx, (label, body) in enumerate(items):
        pill(c, str(idx + 1), x, y + 33, 23, 23, [BLUE, GREEN, GOLD, PLUM, RED][idx], label_color=WHITE)
        para(c, f"<b>{label}</b><br/>{body}", x + 30, y + 53, 78, "Tiny")
        if idx < len(items) - 1:
            arrow(c, x + 112, y + 44, x + 132, y + 44, MUTED)
        x += 106

    code_box(
        c,
        MARGIN,
        98,
        CONTENT_W,
        118,
        [
            'Input phrase: "The onboarding flow is giving main character energy."',
            'Lookup candidates: "main character energy" + maybe "MCE"',
            "Output to analyst: likely means confident, spotlighted, self-centered, or",
            "attention-commanding depending on context; cite definitions and keep uncertainty.",
        ],
        "workflow note",
    )


def examples_second(c: canvas.Canvas):
    page_bg(c, 5, "Workflow Patterns")
    text(c, "Pattern A: Explain A Term In Context", MARGIN, 674, 12, INK, True)
    card(c, MARGIN, 565, CONTENT_W, 90, "Context-aware lookup", "Use the user's surrounding sentence to decide whether `sort_by=top` or `sort_by=recent` is more useful. Top definitions give broad consensus; recent definitions can reveal new shifts in meaning.", BLUE)
    text(c, "Pattern B: Build A Slang Evidence Panel", MARGIN, 515, 12, INK, True)
    cols = [("Term", "rizz"), ("Candidate Meaning", "charisma or flirting skill"), ("Confidence Inputs", "votes, date, repeated senses"), ("Provenance", "defid + permalink")]
    x = MARGIN
    for title, body in cols:
        card(c, x, 407, (CONTENT_W - 24) / 4, 72, title, body, GREEN)
        x += (CONTENT_W - 24) / 4 + 8
    text(c, "Pattern C: Stable Citation", MARGIN, 354, 12, INK, True)
    para(
        c,
        "When an example is used in documentation, training data review, or a compiler trace, prefer `urban_dictionary_defid` after discovery. The defid anchors the source entry so the workflow can be repeated and audited.",
        MARGIN,
        330,
        CONTENT_W,
        "Body",
    )
    text(c, "Pattern D: Language Drift Watch", MARGIN, 260, 12, INK, True)
    para(
        c,
        "A client can periodically compare top definitions with recent definitions for the same term. Divergence is a useful signal that the word may be changing, fragmented by community, or overloaded with multiple meanings.",
        MARGIN,
        236,
        CONTENT_W,
        "Body",
    )
    code_box(
        c,
        MARGIN,
        90,
        CONTENT_W,
        105,
        [
            "top = define(term, sort_by='top', limit=3)",
            "recent = define(term, sort_by='recent', limit=3)",
            "if meanings diverge:",
            "  mark as ambiguous / culturally unstable",
            "  ask for context or keep multiple candidate meanings",
        ],
        "language drift",
    )


def shipmb(c: canvas.Canvas):
    dest(c, "shipmb")
    page_bg(c, 6, "Bridge To ShipMBCompiler's English Understanding")
    para(
        c,
        "ShipMBCompiler is English-first, but bounded: prose must normalize into explicit compiler constructs before it lowers through Core, semantic operations, IR, and bytecode. urbandictmcp is useful as a reviewed slang-enrichment source, not as open-ended natural-language authority.",
        MARGIN,
        TOP - 52,
        CONTENT_W,
        "Body",
    )
    text(c, "Current English Pipeline", MARGIN, 628, 12, INK, True)
    x = MARGIN
    y = 520
    pieces = [
        ("Thesaurus", "Curated triggers, synonyms, WordNet, and local JSON."),
        ("Normalizer", "Cleans source and words, including simple contractions."),
        ("Lexer / Parser", "Maps normalized prose into curated compiler patterns."),
        ("Semantics", "Checks symbols, effects, devices, commands, and diagnostics."),
    ]
    for i, (title, body) in enumerate(pieces):
        bx = x + i * ((CONTENT_W - 24) / 4 + 8)
        card(c, bx, y, (CONTENT_W - 24) / 4, 76, title, body, [BLUE, GREEN, GOLD, PLUM][i])
        if i < 3:
            arrow(c, bx + (CONTENT_W - 24) / 4 + 1, y + 38, bx + (CONTENT_W - 24) / 4 + 8, y + 38, MUTED)

    text(c, "Best Fit: Pre-Compilation Slang Sync", MARGIN, 460, 12, INK, True)
    steps = [
        ("Lookup", "`shipmbc slang sync` asks urbandictmcp for candidates."),
        ("Review", "Generated slang files are reviewed before use."),
        ("Load", "Compile uses JSON via `--thesaurus-path`."),
        ("Compile", "`compile_source()` stays offline and deterministic."),
    ]
    x = MARGIN
    y = 365
    for i, (title, body) in enumerate(steps):
        bx = x + i * ((CONTENT_W - 24) / 4 + 8)
        card(c, bx, y, (CONTENT_W - 24) / 4, 70, title, body, [CYAN, GOLD, GREEN, RED][i])

    text(c, "Concrete Examples", MARGIN, 320, 12, INK, True)
    card(c, MARGIN, 226, CONTENT_W / 2 - 8, 68, "Aliases Into Canonical Triggers", "`fire up -> open`, `shut it down -> close`, and `send it -> execute` normalize casual prose into existing actions.", BLUE)
    card(c, MARGIN + CONTENT_W / 2 + 8, 226, CONTENT_W / 2 - 8, 68, "Local Slang Thesaurus", "`grab -> use`, `kick -> execute`, `flash -> show`, `err -> error`, and `mic -> voice` enrich phrasing.", GREEN)
    card(c, MARGIN, 132, CONTENT_W / 2 - 8, 72, "Ambiguity Stays Inactive", "`pull up` remains a candidate until reviewed and mapped to a known trigger.", GOLD)
    card(c, MARGIN + CONTENT_W / 2 + 8, 132, CONTENT_W / 2 - 8, 72, "Blocked Aliases Protect Meaning", "Blocked triggers keep phrases like `tv pack library` from silently changing identifiers.", RED)

    code_box(
        c,
        MARGIN,
        66,
        CONTENT_W,
        46,
        ['mcp "urban-dictionary" |> tool "urban_dictionary_define" with term "fire up"', "Core can declare this call; runtime records it, but live lookup is not compile-time behavior."],
        None,
    )


def operate(c: canvas.Canvas):
    dest(c, "operate")
    page_bg(c, 7, "Operate & Test")
    text(c, "Install In An MCP Client", MARGIN, 674, 12, INK, True)
    code_box(
        c,
        MARGIN,
        495,
        CONTENT_W,
        155,
        [
            '{',
            '  "mcpServers": {',
            '    "urban-dictionary": {',
            '      "command": "node",',
            '      "args": ["C:\\\\Users\\\\admin\\\\Documents\\\\urbandictmcp\\\\server.js"]',
            "    }",
            "  }",
            "}",
        ],
        "client config",
    )
    card(c, MARGIN, 370, CONTENT_W / 3 - 8, 86, "No install step", "The server uses Node built-ins only. Node.js 18 or newer is enough.", GREEN)
    card(c, MARGIN + CONTENT_W / 3 + 4, 370, CONTENT_W / 3 - 8, 86, "Environment controls", "Set API base and request timeout with environment variables.", BLUE)
    card(c, MARGIN + 2 * (CONTENT_W / 3 + 4), 370, CONTENT_W / 3 - 8, 86, "Local smoke test", "`npm run smoke` uses a fake local API so validation does not need internet access.", GOLD)
    text(c, "Runtime Boundary", MARGIN, 302, 12, INK, True)
    para(
        c,
        "The server is a stdio MCP process, not a web server. Your MCP client owns launch, permissions, and UI. urbandictmcp owns schema validation, Urban Dictionary API calls, normalization, and response formatting.",
        MARGIN,
        278,
        CONTENT_W,
        "Body",
    )
    code_box(
        c,
        MARGIN,
        108,
        CONTENT_W,
        118,
        [
            "npm start        # run MCP server over stdio",
            "npm run smoke    # verify initialize, tools/list, define, defid, random",
            "node server.js   # direct stdio launch for MCP clients",
        ],
        "commands",
    )


def guardrails(c: canvas.Canvas):
    dest(c, "guardrails")
    page_bg(c, 8, "Guardrails")
    items = [
        ("Crowdsourced content", "Definitions may be explicit, offensive, inaccurate, sarcastic, or community-specific."),
        ("Not formal semantics", "Use results as evidence for possible meanings, not as canonical English rules."),
        ("Context is required", "The same slang can praise, insult, joke, or signal identity depending on speaker and scene."),
        ("Preserve provenance", "Keep defid, permalink, votes, dates, and query text when the result influences an output."),
        ("Respect user safety", "Filter or warn before showing explicit text in workplace, classroom, or child-facing flows."),
        ("Handle failure", "API timeouts, non-JSON responses, empty lists, and unknown terms should become graceful client states."),
    ]
    x = MARGIN
    y = 618
    for i, (title, body) in enumerate(items):
        col = i % 2
        row = i // 2
        card(c, x + col * (CONTENT_W / 2 + 8), y - row * 130, CONTENT_W / 2 - 8, 96, title, body, [RED, GOLD, BLUE, GREEN, PLUM, CYAN][i])

    text(c, "Recommended Confidence Inputs", MARGIN, 205, 12, INK, True)
    bars = [("Vote score", 0.82, GREEN), ("Recency", 0.58, BLUE), ("Definition agreement", 0.72, PLUM), ("Context match", 0.9, GOLD)]
    x = MARGIN
    y = 168
    for label, pct, col in bars:
        text(c, label, x, y + 5, 8.5, INK, True)
        c.setFillColor(colors.HexColor("#e8eef0"))
        c.roundRect(x + 120, y, 340, 14, 4, stroke=0, fill=1)
        c.setFillColor(col)
        c.roundRect(x + 120, y, 340 * pct, 14, 4, stroke=0, fill=1)
        y -= 28


def appendix(c: canvas.Canvas):
    dest(c, "appendix")
    page_bg(c, 9, "Appendix")
    text(c, "Tool Schemas At A Glance", MARGIN, 674, 12, INK, True)
    code_box(
        c,
        MARGIN,
        452,
        CONTENT_W,
        198,
        [
            "urban_dictionary_define:",
            "  term: string, required",
            "  limit: integer 1..10, default 3",
            "  sort_by: top | recent | api, default top",
            "",
            "urban_dictionary_random:",
            "  limit: integer 1..10, default 3",
            "",
            "urban_dictionary_defid:",
            "  defid: positive integer, required",
        ],
        "schemas",
    )
    text(c, "Primary Source Files", MARGIN, 396, 12, INK, True)
    card(c, MARGIN, 305, CONTENT_W / 2 - 8, 68, "server.js", "MCP protocol handling, tool schemas, fetch logic, normalization, structured content, and error handling.", BLUE)
    card(c, MARGIN + CONTENT_W / 2 + 8, 305, CONTENT_W / 2 - 8, 68, "scripts/smoke-test.js", "Local fake API and JSON-RPC smoke coverage for initialize, tools/list, define, defid, and random.", GREEN)
    text(c, "Clickable References", MARGIN, 248, 12, INK, True)
    external_button(c, "Urban Dictionary API define", "https://api.urbandictionary.com/v0/define?term=hello", MARGIN, 205, 155, 26, BLUE)
    external_button(c, "Urban Dictionary random", "https://api.urbandictionary.com/v0/random", MARGIN + 168, 205, 145, 26, GREEN)
    para(
        c,
        "This guide is generated from the repository surface and is designed to be updated as the MCP server grows. Regenerate it with the script in `scripts/generate-interactive-pdf.py`.",
        MARGIN,
        162,
        CONTENT_W,
        "Body",
    )


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF_PATH), pagesize=letter, pageCompression=1)
    c.setTitle("urbandictmcp Interactive Feature Guide")
    c.setAuthor("Codex")
    c.setSubject("Features, workflows, real-world examples, and ShipMBCompiler bridge")
    cover(c)
    c.showPage()
    feature_map(c)
    c.showPage()
    workflow(c)
    c.showPage()
    examples(c)
    c.showPage()
    examples_second(c)
    c.showPage()
    shipmb(c)
    c.showPage()
    operate(c)
    c.showPage()
    guardrails(c)
    c.showPage()
    appendix(c)
    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    build()
