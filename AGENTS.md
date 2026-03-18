---
name: repository-agents
description: Repository guide for understanding, creating, configuring, and maintaining agent-related assets in Data Storyteller Quest.
---

# AGENTS.md

This repository contains two different kinds of “agent” work:

1. **The application itself**, which is a React/Vite frontend served by an Express backend.
2. **Agent development assets**, which live alongside the app as reusable skills, workflows, templates, and Deep Agents examples that help contributors create or maintain agent-based tooling.

This document explains the purpose of those agent assets, how they fit into the repository architecture, and how to add or maintain them safely and consistently.

## Purpose and Scope

Use the agent-related folders in this repository to:

- document reusable agent skills and workflows
- scaffold new Deep Agents examples or templates
- validate agent configurations before publishing or sharing them
- mirror select skills into Codex-compatible locations
- keep contributor guidance centralized and easy to discover

This file is **not** a contract for a production agent runtime inside the deployed web app. Today, the deployed service is:

- **Frontend:** React + Vite assets from `src/`, built into `dist/`
- **Backend:** Express API in `server/index.js`
- **LLM integration:** Gemini access on the server only via `GEMINI_API_KEY`

If you introduce a new runtime agent feature in the future, keep it aligned with the server-side security model described in `README.md` and avoid exposing secrets to the browser.

## Repository Locations

Agent-related content currently appears in three main places:

| Path | Purpose |
| --- | --- |
| `.github/workflows/` | Main library of workflow-oriented skills and references |
| `.github/skills/` | Repository-local skills available to coding agents in this repo |
| `.codex/skills/` | Codex-facing mirror of selected skills |

Supporting agent material may also appear under:

- `.codex/environments/` for environment configuration
- `references/`, `assets/`, or `scripts/` folders nested under individual skill/workflow directories

## How Agents Interact with the System Architecture

### Current application architecture

The shipped application is a single service:

```text
Browser UI (React/Vite) -> Express API -> Gemini
```

Key boundaries:

- the browser should only call approved API routes
- secrets such as `GEMINI_API_KEY` stay on the server
- static frontend assets are served from `dist/`
- backend behavior lives in `server/index.js`

### Where agent assets fit

The repository’s agent assets currently support the system in an **adjacent** way rather than as a direct runtime component. They are used to:

- guide contributors working with GitHub Copilot/Codex skills
- provide templates for Deep Agents projects
- document repeatable workflows such as testing, CI triage, prompt building, and web development
- supply validation and scaffolding scripts for agent projects

### Integration expectations for future agents

If a future change adds an agent that participates in application behavior:

1. run it **server-side by default** unless there is a strong reason not to
2. keep secret material out of frontend bundles
3. define clear input/output contracts with the rest of the app
4. document the entrypoint, model/provider assumptions, tools, and failure behavior
5. add a fallback or degraded path when the agent is unavailable

## Existing Conventions

Agent and skill documentation in this repository generally follows these patterns:

### 1. Use front matter

Many existing skill files begin with YAML front matter:

```md
---
name: example-skill
description: One-line summary of what the skill does and when to use it.
---
```

### 2. Prefer structured Markdown sections

A good agent or skill document typically includes:

- a clear title
- when to use it
- prerequisites or assumptions
- workflow or setup steps
- examples
- references to supporting files

### 3. Keep examples near the skill

When a skill needs more than prose, place supporting materials near it:

- `references/` for detailed reference docs
- `assets/` for templates and examples
- `scripts/` for repeatable tooling

### 4. Mirror deliberately

If a skill needs to be available both in GitHub and Codex contexts, keep the mirrored copies aligned between:

- `.github/skills/...`
- `.codex/skills/...`

## Creating a New Agent or Skill

Use the smallest structure that fits the task.

### Option A: Add or extend a skill document

Choose this when you need guidance, reusable operating instructions, or a documented workflow.

Recommended steps:

1. Pick the correct home:
   - `.github/workflows/` for broader workflow documentation
   - `.github/skills/` for repo-local agent skills
   - `.codex/skills/` only when a Codex mirror is required
2. Create a descriptive directory name in kebab-case.
3. Add `SKILL.md` with front matter and a concise opening description.
4. Add `references/`, `assets/`, or `scripts/` only if they materially improve usability.
5. Cross-link related docs with relative links.

Minimal template:

```md
---
name: my-new-skill
description: Explain what the skill does, when to use it, and what it is best at.
---

# My New Skill

## When to Use This Skill

- Use case one
- Use case two

## Prerequisites

- Required tools, runtime, or context

## Recommended Workflow

1. Discover context
2. Apply the skill
3. Validate results

## References

- `references/example.md`
```

### Option B: Add a Deep Agents example or starter

Choose this when you need a runnable agent example, template, or config validation flow.

The repository already includes Deep Agents tooling and examples under:

- `.github/workflows/deepagents-setup-configuration/`
- `.github/workflows/deepagents-planning-todos/`

Use the repository-local scaffolding and validation scripts documented there. For example:

```bash
uv run .github/workflows/deepagents-setup-configuration/scripts/init_deep_agent_project.py my-agent --language python --template simple --path skills/
uv run .github/workflows/deepagents-setup-configuration/scripts/validate_deep_agent_config.py path/to/agent.py
```

Example Python configuration pattern:

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-5-20250929",
    tools=[...],
    system_prompt="You are a domain specialist.",
    subagents=[...],
    checkpointer=checkpointer,
)
```

## Configuration Checklist

When creating or updating an agent, explicitly document:

- **purpose:** what problem the agent solves
- **entrypoint:** where the agent starts or is invoked
- **model/provider:** which model is expected
- **tools:** external capabilities or function calls the agent can use
- **inputs/outputs:** expected schema or message structure
- **state:** whether it is stateless, checkpointed, or store-backed
- **fallbacks:** what happens on timeout, invalid output, or provider failure
- **security:** how secrets, files, and privileged operations are controlled

## Maintenance Conventions

Keep agent assets maintainable by following these rules:

### Version and dependency hygiene

- prefer existing repository tooling over introducing new dependencies
- re-validate examples when agent framework versions change
- keep example dependencies pinned or clearly documented

### Documentation hygiene

- keep descriptions specific and task-oriented
- remove stale examples and dead links
- update mirrored skill copies together when the content is intentionally shared

### File hygiene

- do not commit secrets
- avoid absolute local paths in examples
- keep generated artifacts out of the repository unless they are intentional fixtures

### Validation hygiene

Before merging agent-related changes:

- run the repository’s existing validation commands when the change could affect the app
- run any skill-specific validators or setup commands that already exist
- manually review rendered Markdown for readability and broken structure

## Best Practices for Agent Communication

Whether the agent is a documented skill, a Deep Agent, or a future runtime component, communication should be:

### Clear

- define the agent’s role in one sentence
- describe expected inputs and outputs explicitly
- prefer structured output when another system consumes the result

### Bounded

- give the agent only the tools and scope it needs
- separate specialist responsibilities instead of creating one oversized agent
- avoid ambiguous instructions that mix planning, execution, and approval logic

### Observable

- make failures diagnosable
- document where logs, traces, or checkpoints live
- include validation steps so maintainers can reproduce behavior

### Safe

- keep secrets server-side
- constrain filesystem or network access where applicable
- require human approval for destructive or high-impact actions when supported

## Agent Lifecycle Management

Use this lifecycle when introducing or maintaining agents:

1. **Define** the use case, boundaries, and success criteria.
2. **Design** the prompt, tools, state model, and failure handling.
3. **Implement** the smallest viable skill, config, or example.
4. **Validate** with existing lint/build/test or agent-specific validation workflows.
5. **Document** setup, assumptions, and maintenance ownership.
6. **Monitor** for framework drift, stale examples, and broken references.
7. **Retire or replace** outdated agents rather than letting them silently decay.

## Example Use Cases

### 1. Contributor-facing workflow skill

A skill under `.github/workflows/` can document a reusable workflow such as:

- fixing CI failures
- reviewing web design
- testing a web app with Playwright
- generating prompts or specifications

### 2. Repo-local coding assistant skill

A skill under `.github/skills/` or `.codex/skills/` can provide targeted instructions for:

- GitHub review comment triage
- CI debugging
- Dockerfile generation
- local web application testing

### 3. Runnable Deep Agent starter

A Deep Agents example can show how to:

- create subagents for domain specialization
- persist checkpoints or memories
- validate configuration before sharing
- package a minimal starter for new contributors

## Quick Start for Maintainers

If you are new to the repository and need to work on agent-related content quickly:

1. Read this file and `README.md`.
2. Inspect existing `SKILL.md` files for the closest pattern.
3. Reuse existing directories and scripts before creating new structure.
4. Keep `.github` and `.codex` copies aligned when mirroring is intended.
5. Validate the change and confirm the documentation is actionable for the next contributor.

## Related Paths

- [README.md](README.md)
- [.github/workflows/deepagents-setup-configuration/SKILL.md](.github/workflows/deepagents-setup-configuration/SKILL.md)
- [.github/workflows/deepagents-setup-configuration/references/deep-agents-reference.md](.github/workflows/deepagents-setup-configuration/references/deep-agents-reference.md)
- [.github/workflows/webapp-testing/SKILL.md](.github/workflows/webapp-testing/SKILL.md)
- [.github/skills/](.github/skills/)
- [.codex/skills/](.codex/skills/)
