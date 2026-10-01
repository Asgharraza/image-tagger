# Image Tagger — AI Vision API

Upload an image, get AI-generated tags. Search and filter by tag.

## What it does

1. You `POST /tag` with an image file
2. A vision LLM (Gemma 4 via OpenRouter) analyzes the image
3. It returns 3–8 short tags as validated JSON
4. The image + tags are stored in SQLite
5. You can search by tag with `GET /images?tag=forest`

## Setup

```powershell
npm install