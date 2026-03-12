# LLM Translation Feature — Design

**Date:** 2026-03-12
**Scope:** Card editor — AI-assisted translation via Claude Haiku

## Overview

Card-master users can translate a card's Czech text into all four supported languages (EN, RU, UK, ES) with a single button click in the card edit/add dialog. Translation is text-only, does not auto-save — user reviews and saves manually.

## Architecture

```
EditorCardsView.vue (button)
  → editorStore.translateCard(text, type)
    → POST /api/editor/cards/translate
      → verifyJwt + isCardMaster()
        → Anthropic SDK (Claude Haiku)
          → { en, ru, uk, es }
    → fills translation fields in modal (no auto-save)
```

## Backend Endpoint

**Route:** `POST /api/editor/cards/translate`
**Auth:** `verifyJwt` preHandler + `isCardMaster()` check in handler
**Body:** `{ text: string, type: 'black' | 'white' }`
**Response:** `{ translations: { en, ru, uk, es } }`
**Timeout:** 30s
**Note:** `cardId` is not needed — translation is a pure text operation, works for unsaved cards too.

## System Prompt

```
You are a translation assistant for a Cards Against Humanity style party game called KPL.
Translate the given Czech card text into English, Russian, Ukrainian, and Spanish.

Rules:
- Preserve the original meaning, tone, and humor exactly
- Keep proper nouns and cultural references unchanged (do not adapt them)
- The game contains adult, politically incorrect, and dark humor — translate faithfully without softening
- Return ONLY valid JSON in this exact format: {"en":"...","ru":"...","uk":"...","es":"..."}
- No explanations, no markdown, just the JSON object
```

## Error Handling

| Situation | Behavior |
|---|---|
| Anthropic API unavailable / timeout | Toast error, fields stay empty |
| Invalid JSON response from Haiku | Toast error (parse failed) |
| Text > 500 chars | Backend returns 400 before calling API |
| User is not card-master | Backend returns 403 |
| Success | Fields filled, user reviews and saves manually |

## Files Changed

| File | Change |
|---|---|
| `.env` + `.env.example` | Add `ANTHROPIC_API_KEY=` |
| `packages/backend/src/routes/editorCards.ts` | Add `POST /api/editor/cards/translate` endpoint |
| `packages/frontend/src/stores/editorStore.ts` | Add `translateCard(text, type)` method |
| `packages/frontend/src/views/EditorCardsView.vue` | Translate button in modal + loading state |

**New dependency:** `@anthropic-ai/sdk` in `packages/backend/package.json`

## UI Details

- Button placed below the Czech text textarea, above translation fields
- Label: `Přeložit pomocí AI`
- Loading state: `Překládám…` + spinner
- Visible only to card-master users
- Disabled when `modalText` is empty
