# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.23] - 2026-05-02

### Added
- Team coordinator agent runtime support
- Team lead coordinator role

### Changed
- Dashboard sidebar: sorted items and introduced section grouping

### Security
- Security layer improvements across the gateway

---

## [0.1.20] - 2026-05-02

### Added
- Skills-per-agent configuration — each agent can now declare its own skill set

### Fixed
- Argument list error in agent invocation

### Changed
- Removed obsolete documentation files
- README: added project banner and restructured layout with `div` sections

---

## [0.1.x] - 2026-05-01

### Added
- Workspace menu in the dashboard
- Message approval flow — outgoing agent messages can require human approval
- Notification approval flow for tool actions

### Changed
- Budget section UI improvements

### Fixed
- Model provider selection bug
- Teams run execution issue

---

## [0.1.3] - 2026-04-30

### Added
- **Tool Approval UI** — review and approve/deny tool calls before execution
- **Tool Approval Card** component in dashboard
- **Memory backend** — persistent key-value store for agent memory
- **Audit log viewer** — view a timestamped history of all agent actions
- **Webhook trigger** — trigger agent workflows via incoming HTTP webhooks
- **Scheduled tasks** — cron-style task scheduling for agents
- **Session History Viewer** — browse past conversation sessions
- **Per-agent Telegram** integration — dedicated Telegram bot binding per agent
- Agent avatar display in the dashboard
- CLI daemon management with background gateway processes
- First-run setup wizard for initial configuration

### Changed
- Dashboard and login page: new HTML templates with refreshed UI styling

### Fixed
- Syntax error (`Unexpected token '{'`) in agent runtime
- Regex parse error (`Nothing to repeat`)
- String handling bug in message processing
- Button press not registering in approval flow

---

## [0.1.0] - 2026-04-28

### Added
- Initial release of **AI DESK** — a Security-First, Token-Efficient AI Gateway
- Multi-agent orchestration system with task graph DAG
- MCP (Model Context Protocol) tool integration
- CLI entry point (`ai-desk`) with skill registry
- Gateway server infrastructure with background daemon support
- Dashboard agent management: configuration CRUD with atomic file operations
- Automated setup wizard: environment configuration, credential validation, and dynamic service initialization
- Self-contained dashboard UI with status panel, chat interface, and credentials management
- Project documentation in README

[Unreleased]: https://github.com/karizo502/AI_DESK/compare/v0.1.23...HEAD
[0.1.23]: https://github.com/karizo502/AI_DESK/compare/v0.1.20...v0.1.23
[0.1.20]: https://github.com/karizo502/AI_DESK/compare/v0.1.3...v0.1.20
[0.1.3]: https://github.com/karizo502/AI_DESK/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/karizo502/AI_DESK/releases/tag/v0.1.0
