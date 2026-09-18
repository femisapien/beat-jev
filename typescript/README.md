# Beat Jev · TypeScript

Five shots against an AI keeper. **Render Workflows** runs every turn; **TypeSafe Jev** picks the keeper’s move; **Render Postgres** keeps the score.

<a href="https://render.com/docs/workflows?utm_source=github&utm_medium=referral&utm_campaign=ojus_demos&utm_content=readme_workflows" target="_blank" rel="noopener noreferrer"><img alt="Render Workflows" src="https://img.shields.io/badge/Render-Workflows-6D3BC6?logo=render&logoColor=white" /></a>
<a href="https://typesafe.ai" target="_blank" rel="noopener noreferrer"><img alt="TypeSafe Jev" src="https://img.shields.io/badge/TypeSafe-Jev-252525" /></a>
<a href="https://render.com/docs/postgresql" target="_blank" rel="noopener noreferrer"><img alt="Render Postgres" src="https://img.shields.io/badge/Postgres-4169E1?logo=postgresql&logoColor=white" /></a>
<a href="https://threejs.org" target="_blank" rel="noopener noreferrer"><img alt="Three.js" src="https://img.shields.io/badge/Three.js-222222?logo=threedotjs&logoColor=white" /></a>

<a href="https://dashboard.render.com/login?next=%2Fblueprint%2Fnew%3Frepo%3Dhttps%253A%252F%252Fgithub.com%252Fojusave%252Fbeat-jev%26path%3Drender.yaml%26utm_source%3Dgithub%26utm_medium%3Dreferral%26utm_campaign%3Dojus_demos%26utm_content%3Dreadme_deploy_typescript&utm_source=github&utm_medium=referral&utm_campaign=ojus_demos&utm_content=readme_deploy_typescript" target="_blank" rel="noopener noreferrer"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" /></a>

<a href="https://beat-jev-typescript-web.onrender.com" target="_blank" rel="noopener noreferrer">Play the live game ↗</a>

## Deploy

The Blueprint creates a paid web service, a usage-billed workflow with all five tasks, and a paid Postgres database. Enter your **Render API key** and **TypeSafe API key** when prompted. Database connections and the workflow slug are wired automatically. No OpenRouter key is needed.

## Play

1. Enter a nickname and press **Play**.
2. Tap the goal to shoot, or use arrow keys and Space.
3. Take five penalties. Press **Try again** for a new match.

Open **Render Workflows** below the pitch to inspect real task runs and Jev’s decision. The goalkeeper commits before seeing your target.

## Local development

From the repository root, with Node 24, the Render CLI, and a Postgres database:

```sh
npm ci
# The TypeScript backend needs no Python runtime.
cp .env.example .env
# Set DATABASE_URL and TYPESAFE_API_KEY in .env.
npm run dev:typescript
```

Open `http://127.0.0.1:5183`. Local mode uses Render’s local workflow server. The database schema is created on API startup.

<a href="https://github.com/ojusave/beat-jev/blob/main/docs/architecture.md" target="_blank" rel="noopener noreferrer">Architecture, retries, and tests ↗</a>
