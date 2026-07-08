import cors from "cors";
import express, { Request, Response } from "express";
import { actionGroups, currentUser, stats } from "./data";
import { currentMember, currentLoan, memberActions } from "./memberData";
import { ActionGroup } from "./types";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

// GET /api/dashboard - stats + logged in user, shown on the home screen
app.get("/api/dashboard", (_req: Request, res: Response) => {
  res.json({ stats, user: currentUser });
});

// GET /api/actions - full list of actions grouped by category
// GET /api/actions?q=hardware - filtered flat/grouped list for the search bar
app.get("/api/actions", (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

  if (!q) {
    res.json({ groups: actionGroups });
    return;
  }

  const filteredGroups: ActionGroup[] = actionGroups
    .map((group) => ({
      category: group.category,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    }))
    .filter((group) => group.items.length > 0);

  res.json({ groups: filteredGroups });
});

// GET /api/member/dashboard - the logged-in member, their most relevant current
// loan (or null), and whether they have any overdue hardware
app.get("/api/member/dashboard", (_req: Request, res: Response) => {
  res.json({
    user: currentMember,
    loan: currentLoan,
    hasOverdueLoan: currentLoan?.status === "OVERDUE",
  });
});

// GET /api/member/actions - the flat list of home-screen actions
app.get("/api/member/actions", (_req: Request, res: Response) => {
  res.json({ items: memberActions });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Synaptech Hardware Management API running on http://localhost:${PORT}`);
});
