# GitHub Issues Integration Protocol

## Repository
`zikeji/ManlyCam` — GitHub Issues are the passive progress tracker for epics and stories.

## Protocol

### Every commit
All commits MUST include the co-author trailer:
```
Co-authored-by: GitHub Copilot <copilot@github.com>
```

### Every PR
PR descriptions MUST include a `Closes #N` keyword for the story's GitHub Issue number (see map below). GitHub will auto-close the issue when the PR is merged — no manual issue management required.

Example PR description footer:
```
Closes #7
Co-authored-by: GitHub Copilot <copilot@github.com>
```

### Do NOT
- Manually open/close/comment on issues during implementation
- Treat issue state as authoritative — the story file is the source of truth
- Require MCP/GitHub API access to implement a story

---

## Story → Issue Number Map

| Story | Title | Issue |
|-------|-------|-------|
| 1.1 | Monorepo Scaffold & Tooling | #7 |
| 1.2 | CI/CD Pipeline | #8 |
| 1.3 | Shared Types Package | #9 |
| 1.4 | Local Dev Environment | #10 |
| 2.1 | Google OAuth Integration | #11 |
| 2.2 | Session Management | #12 |
| 2.3 | Role-Based Access Control | #13 |
| 2.4 | Ban System | #14 |
| 2.5 | Auth UI | #15 |
| 3.1 | rpicam-vid Capture Pipeline | #16 |
| 3.2 | HLS Packaging & Delivery | #17 |
| 3.3 | frp Tunnel Integration | #18 |
| 3.4 | Video Player UI | #19 |
| 3.5 | Stream Health & Reconnection | #20 |
| 3.6 | Stream Access Control | #21 |
| 4.1 | WebSocket Server Infrastructure | #22 |
| 4.2 | Chat Message Persistence | #23 |
| 4.3 | Presence & Online Status | #24 |
| 4.4 | Chat UI | #25 |
| 4.5 | Message Moderation Actions | #26 |
| 4.6 | Chat History & Pagination | #27 |
| 5.1 | UserTag System | #28 |
| 5.2 | User Moderation Tools | #29 |
| 5.3 | Role Management UI | #30 |
| 5.4 | Audit Log | #31 |
| 5.5 | User List & Search | #32 |
| 5.6 | Self-Service Profile | #33 |
| 6.1 | Pi Agent Daemon | #34 |
| 6.2 | Remote Configuration | #35 |
| 6.3 | Operational Dashboard | #36 |

## Epic → Issue Map

| Epic | Title | Issue |
|------|-------|-------|
| 1 | Monorepo Foundation & CI/CD | #1 |
| 2 | Authentication & Access Control | #2 |
| 3 | Live Video Stream | #3 |
| 4 | Real-Time Chat & Presence | #4 |
| 5 | Moderation, Roles & User Management | #5 |
| 6 | Pi Agent Operational Tooling | #6 |
