# Start Here

You do not need an app yet. I made a simple starter dashboard that opens directly in your browser.

## Option 1: Open It Now

Open this file:

```text
index.html
```

Double-click it, or right-click it and choose your browser.

That is the easiest way to see the dashboard working.

## Option 2: Make It Your First Website Project

Create a folder for your project, then copy this file into it:

```text
index.html
```

Now you have a one-page website.

## Option 3: Later, Convert It To React

When you are ready for a real React app, use these steps:

```bash
npm create vite@latest my-dashboard
cd my-dashboard
npm install
npm run dev
```

Then copy these files into your React project:

```text
components/NeuroNestDashboard.jsx
components/neuronest-dashboard.css
```

Install the icon package:

```bash
npm install lucide-react
```

Use it inside `src/App.jsx`:

```jsx
import NeuroNestDashboard from "./components/NeuroNestDashboard";

export default function App() {
  return <NeuroNestDashboard />;
}
```

## What To Edit First

In `index.html`, search for:

```text
NeuroNest
```

Replace it with your app name.

Then search for the sample cards like:

```text
Blue Bottle Cafe
Startup idea
Sorrento Restaurant
```

Replace those with your own dashboard content.
