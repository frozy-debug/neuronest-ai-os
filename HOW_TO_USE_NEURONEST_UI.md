# NeuroNest UI: How to Apply It

This workspace contains a ready React UI inspired by the screenshot:

- `components/NeuroNestDashboard.jsx`
- `components/neuronest-dashboard.css`

## 1. Install Icons

The component uses `lucide-react`.

```bash
npm install lucide-react
```

## 2. Copy Files Into Your App

Copy the `components` folder into your React project, usually one of these places:

```text
src/components/
app/components/
components/
```

Keep both files in the same folder:

```text
components/
  NeuroNestDashboard.jsx
  neuronest-dashboard.css
```

## 3. Use It In React Or Vite

In your page or `App.jsx`:

```jsx
import NeuroNestDashboard from "./components/NeuroNestDashboard";

export default function App() {
  return <NeuroNestDashboard />;
}
```

If your component folder is inside `src`, the import may be:

```jsx
import NeuroNestDashboard from "./components/NeuroNestDashboard";
```

## 4. Use It In Next.js App Router

Create or update a page file:

```jsx
import NeuroNestDashboard from "@/components/NeuroNestDashboard";

export default function DashboardPage() {
  return <NeuroNestDashboard />;
}
```

If your Next.js project blocks remote images in CSS, replace the Unsplash image URLs in `neuronest-dashboard.css` with local assets from your `public` folder.

## 5. Customize It

The main colors are CSS variables at the top of `neuronest-dashboard.css`:

```css
:root {
  --nn-bg: #050711;
  --nn-panel: rgba(13, 18, 32, 0.82);
  --nn-blue: #24c6ff;
  --nn-violet: #7c3aed;
}
```

The demo data is inside `NeuroNestDashboard.jsx`:

```jsx
const navItems = [...]
const memoryCards = [...]
const recentMemories = [...]
const moments = [...]
```

Replace those arrays with your real data, API response, or state.

## 6. Important Notes

- This is a front-end UI shell. Buttons and search fields are styled but not connected to backend logic yet.
- For production, move remote image URLs to your own local assets or CDN.
- If you already use Tailwind, you can still use this as regular CSS. Just import the CSS once from the component.
