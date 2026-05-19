# Universal Engineering Rules

These rules are the baseline for AI-assisted software projects. They are
intentionally generic so they can be copied into any repository.

## Security First

- Never commit, print, expose, or transmit secrets, credentials, tokens, keys,
  cookies, private certificates, or sensitive environment values.
- Never log full environment objects or command output that may contain secrets.
- Treat all user input, external data, file paths, URLs, branch names, and shell
  arguments as untrusted until validated.
- Do not implement arbitrary shell execution. Any command execution must use
  explicit allowlists, argument arrays, fixed working directories, timeouts, and
  output limits.
- Require explicit human approval for risky operations such as deployments,
  restarts, destructive file changes, infrastructure changes, permission changes,
  credential access, and public exposure of services.
- Prefer least privilege for filesystem access, processes, containers, network
  permissions, and tokens.

## Simplicity And Maintainability

- Prefer small, explicit modules over large monolithic files.
- Prefer readable code, clear names, direct control flow, and boring technology.
- Avoid hidden magic, unnecessary frameworks, premature abstractions, and
  overengineering.
- Add dependencies only when they provide clear value that cannot be reasonably
  achieved with the standard library or existing project utilities.
- Keep changes focused. Do not mix unrelated refactors, formatting churn, or
  feature work into the same change.
- Preserve backward compatibility unless a breaking change is explicitly
  approved and documented.

## Modular Architecture

- Separate concerns between application logic, adapters, services, data access,
  security, configuration, and user interfaces.
- Keep boundaries explicit and easy to test.
- Avoid tight coupling between infrastructure, business logic, and presentation
  layers.
- Design for incremental scalability: clear seams, stable interfaces, and
  replaceable components without speculative complexity.

## Production-Friendly Development

- Favor predictable behavior, graceful failures, safe defaults, and useful error
  messages.
- Keep logs concise, operationally useful, and non-sensitive.
- Validate inputs at system boundaries.
- Handle timeouts, retries, partial failures, and cleanup where relevant.
- Avoid destructive actions by default. When deletion or replacement is required,
  make it explicit, scoped, and reversible where possible.

## Testing Expectations

- Run lightweight syntax, lint, type, or unit checks when available.
- Add or update tests when changing behavior, shared utilities, security
  controls, data transformations, or user-facing workflows.
- Keep tests focused on meaningful behavior rather than implementation trivia.
- If tests cannot be run, document why and explain the remaining risk.

## Git Workflow

- Keep `main` or the default branch stable and human-reviewed.
- Use a dedicated working branch for AI-assisted changes. For this environment,
  the AI working branch is `razs_ai`.
- Do not merge pull requests automatically unless the project owner explicitly
  approves that workflow.
- Use small, meaningful commits with clear messages.
- Review diffs before finishing work.
- Never rewrite shared history, force-push, reset, or discard changes without
  explicit approval.

## Documentation Expectations

- Keep project guide files current:
  - `RULES.md` for universal engineering and security rules.
  - `AGENTS.md` for project-specific AI agent instructions.
  - `ROADMAP.md` for project vision, milestones, and implementation sequence.
  - `README.md` for human-facing setup, usage, and operations.
- Document new environment variables with safe example values only.
- Document operational changes, security implications, and manual steps.
- Update documentation as part of architecture or workflow changes.

## Safe AI-Assisted Coding

- AI agents must read project guide files before coding.
- AI agents must work only inside approved project directories.
- AI agents must use the approved working branch unless told otherwise by a
  human operator.
- AI agents must not define foundational safety rules from scratch when a
  project-provided `RULES.md` exists.
- AI agents may refine project-specific `AGENTS.md`, `ROADMAP.md`, and
  `README.md`, but must preserve the security and approval model.
- AI agents must not autonomously deploy, restart services, expose networks,
  access credentials, or run destructive commands.

## Dependency Discipline

- Prefer built-in platform features and existing utilities.
- Avoid large frameworks unless they are justified by clear requirements.
- Pin or lock dependencies where the ecosystem expects it.
- Review dependency security, maintenance, and operational impact before adding
  anything new.

## Destructive Actions

- Never delete, overwrite, reset, reformat, or regenerate user work without a
  clear request and explicit confirmation.
- Do not assume uncommitted changes are disposable.
- Before risky changes, summarize the target, impact, and rollback path.

## Branch Strategy

- `main` is the stable human-reviewed branch.
- `razs_ai` is the AI-assisted working branch.
- AI-generated changes should flow from `razs_ai` into `main` through human
  review.
- Initial repository setup may create guide files on `main`, but coding work
  should happen on `razs_ai`.
