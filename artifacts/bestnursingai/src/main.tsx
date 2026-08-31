import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// AuthProvider is mounted inside App, alongside the other providers, and is not
// repeated here. It used to wrap <App/> as well, so two independent instances
// ran: each called useReplitAuth(), each issued its own GET /api/auth/user, and
// each held its own copy of the session. Consumers resolved the inner one, so
// the outer instance's state was never read — it only cost a duplicate request
// on every load and left two answers to "is this nurse signed in?" in memory.
createRoot(document.getElementById("root")!).render(<App />);
