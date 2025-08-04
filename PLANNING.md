# Planning Guide

This document outlines best practices for creating and managing GitHub issues for the Oh Hi Mark project. It provides a structured approach using modern tooling whilst maintaining fallback options.

## Issue Creation Workflow

### 1. Primary Method: MCP Server (Recommended)

If you have access to an MCP (Model Context Protocol) server with GitHub integration:

1. Use the MCP GitHub tools to create issues directly from your development environment
2. Leverage AI assistance for proper issue templating and labelling
3. Automatically link related issues and pull requests
4. Ensure consistent formatting and project conventions

**Benefits:**

- Integrated workflow with development context
- Automatic adherence to project conventions
- Enhanced issue quality through AI assistance
- Seamless linking of related work

### 2. Fallback: VS Code Extensions

If MCP is not available, use VS Code GitHub extensions:

1. **GitHub Pull Requests and Issues** extension (official)
    - Access: Command Palette → "GitHub Issues: Create Issue"
    - Provides templates and label suggestions
    - Integrates with your current branch context

2. **GitHub Issue Notebook** extension
    - Plan and track issues in notebook format
    - Useful for complex feature planning

### 3. Final Fallback: GitHub CLI

When other methods are unavailable:

```bash
# Install GitHub CLI if not present
brew install gh

# Authenticate
gh auth login

# Create a basic issue
gh issue create --title "Issue title" --body "Issue description"

# Create with labels and assignees
gh issue create --title "Issue title" --body "Issue description" --label "bug,high-priority" --assignee @me

# Create from template
gh issue create --web
```

## Issue Types and Best Practices

### Single Issues

**Structure:**

```markdown
## Summary

Brief description of the issue or feature request.

## Context

Why is this needed? What problem does it solve?

## Acceptance Criteria

- [ ] Specific, measurable outcomes
- [ ] Testable requirements
- [ ] Clear definition of "done"

## Technical Notes

- Implementation considerations
- Dependencies or constraints
- Architecture impacts

## Testing Requirements

- Unit tests needed
- Integration test scenarios
- Manual testing steps
```

**Labels to Use:**

- **Type**: `bug`, `feature`, `enhancement`, `documentation`, `chore`
- **Priority**: `low`, `medium`, `high`, `critical`
- **Scope**: `ui`, `backend`, `mobile`, `desktop`, `ci/cd`
- **Status**: `needs-triage`, `ready`, `in-progress`, `blocked`

**Example:**

```markdown
## Summary

Add dark mode toggle to settings screen

## Context

Users have requested the ability to switch between light and dark themes within the app, rather than relying solely on system preferences.

## Acceptance Criteria

- [ ] Toggle switch appears in Settings screen
- [ ] Theme changes immediately when toggled
- [ ] Preference is persisted across app restarts
- [ ] Follows existing Catppuccin theme structure

## Technical Notes

- Extend existing ThemeContext
- Update settings storage in AsyncStorage
- Ensure compatibility with existing theme variants

## Testing Requirements

- [ ] Unit tests for theme switching logic
- [ ] Integration tests for persistence
- [ ] Manual testing on iOS and Android
```

### Epics with Linked Issues

**Epic Structure:**

```markdown
## Epic Overview

High-level description of the feature or initiative.

## Goals and Success Metrics

- Business objectives
- User experience improvements
- Technical goals

## Child Issues

This epic tracks the following child issues (linked via GitHub's parent-child relationships):

### Core Features

- #123 - Feature A implementation (Child Issue)
- #124 - Feature B implementation (Child Issue)

### Supporting Work

- #125 - Documentation updates (Child Issue)
- #126 - Testing infrastructure (Child Issue)

### Dependencies

- #127 - External service integration (Child Issue)

## Timeline

- Phase 1: Core functionality (Child Issues #123, #124)
- Phase 2: Enhancements (Child Issues #125, #126)
- Phase 3: Integration (Child Issue #127)

## Definition of Done

- [ ] All linked issues completed
- [ ] Integration testing passed
- [ ] Documentation updated
- [ ] User acceptance criteria met
```

**Linking Best Practices:**

1. **Use GitHub's native parent-child relationships:**
    - Create the parent issue (epic) first
    - When creating child issues, use the "Development" section in the GitHub UI
    - Or use GitHub CLI with the `--parent` flag (if available)
    - This creates proper hierarchical relationships visible in the UI

2. **Use GitHub's native linking syntax:**

    ```markdown
    Closes #123
    Fixes #124
    Resolves #125
    Related to #126
    Blocked by #127
    ```

3. **Create proper issue relationships:**

    ```bash
    # Link issues using GitHub CLI
    gh issue edit 123 --add-label "epic:new-feature"
    gh issue edit 124 --add-label "epic:new-feature"

    # Create child issues that reference parent
    gh issue create --title "Child Issue" --body "Part of epic #122" --label "epic:new-feature"

    # Add to issue description for explicit hierarchy
    echo "Parent Issue: #122" | gh issue edit 123 --body-file -
    ```

4. **Use GitHub Projects for visual tracking:**
    - Create a project board for the epic
    - Add all related issues to the board
    - Use custom fields for priority and status
    - Enable the "Parent Issue" field in project views

5. **GitHub Issues Hierarchy:**
    ```
    Epic Issue #100
    ├── Feature A #101
    │   ├── Subtask A1 #102
    │   └── Subtask A2 #103
    └── Feature B #104
        ├── Subtask B1 #105
        └── Subtask B2 #106
    ```

## Issue Templates

Create `.github/ISSUE_TEMPLATE/` directory with:

### Bug Report Template

```yaml
name: Bug Report
about: Create a report to help us improve
title: '[BUG] '
labels: ['bug', 'needs-triage']
assignees: ''
```

### Feature Request Template

```yaml
name: Feature Request
about: Suggest an idea for this project
title: '[FEATURE] '
labels: ['feature', 'needs-triage']
assignees: ''
```

### Epic Template

```yaml
name: Epic
about: Large feature or initiative
title: '[EPIC] '
labels: ['epic', 'needs-planning']
assignees: ''
```

## Workflow Integration

### Branch Naming Convention

```
type/issue-number-short-description
```

Examples:

- `feature/123-dark-mode-toggle`
- `bugfix/124-editor-crash`
- `epic/125-cloud-storage-redesign`

### Commit Message Format

```
type(scope): description

Closes #123
```

Examples:

- `feat(ui): add dark mode toggle to settings`
- `fix(editor): resolve crash on empty files`
- `docs(planning): update issue creation guide`

### Pull Request Integration

- Reference issues in PR descriptions
- Use closing keywords to auto-close issues
- Link to epic issues for context

## Quality Checklist

Before creating any issue:

- [ ] Clear, descriptive title
- [ ] Proper labels applied
- [ ] Acceptance criteria defined
- [ ] Technical considerations noted
- [ ] Testing requirements specified
- [ ] Related issues linked (if applicable)
- [ ] Follows project conventions
- [ ] No emojis used (per project guidelines)

## Tools and Resources

### Recommended Extensions

- **VS Code**: GitHub Pull Requests and Issues
- **VS Code**: GitHub Issue Notebook
- **VS Code**: GitLens (for repository insights)

### CLI Tools

- **GitHub CLI**: `gh` - Official GitHub command line tool
- **Hub**: Alternative GitHub CLI tool

### Project Management

- **GitHub Projects**: Native project boards
- **GitHub Milestones**: For release planning
- **GitHub Discussions**: For broader feature discussions

## Best Practices Summary

1. **Start with clear requirements** - Define what success looks like
2. **Use proper linking** - Create meaningful relationships between issues
3. **Follow conventions** - Maintain consistency with project standards
4. **Keep issues focused** - One issue per discrete piece of work
5. **Update regularly** - Keep issues current and close completed work
6. **Use templates** - Ensure consistent structure and required information
7. **Plan epics carefully** - Break down large work into manageable pieces
8. **Test thoroughly** - Define testing requirements upfront
