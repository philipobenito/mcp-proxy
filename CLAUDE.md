# LLM Instructions

This file provides essential guidance to LLMs when working with this repository.

## Critical Behavioural Rules

### Critical: NO EMOJIS

- NEVER use emojis in any response, code, or output
- This includes: ✅ ❌ 🔥 📝 etc.
- Use plain text alternatives: "Success:", "Error:", "Note:"

### Language and Style

- **Use British English** throughout all code, comments, and documentation
- **Never use emojis** in code, commits, documentation, or any text output under any circumstances
- **Use formal, professional language** in all communications
- **Prefer British terms**: "colour" not "color", "behaviour" not "behavior", "optimise" not "optimize", "realise" not "realize"

### Code Standards

- **Follow existing code patterns** and conventions established in the codebase
- **Don't create docstrings** unless they add context that can't be inferred from expressive code/method names
- **Add proper type hints** and structured logging with context
- **Write unit tests** for all new functionality following existing test patterns

### Project Planning and Issue Management

- **CRITICAL**: Follow the guidelines in `PLANNING.md` for all GitHub issue creation and management
- **Always use the prescribed workflow**: MCP server → VS Code extensions → GitHub CLI as fallbacks
- **Maintain proper issue linking**: Use GitHub's native linking syntax for epics and related work
- **Follow issue templates**: Ensure consistent structure and required information in all issues
- **Never create issues without proper planning**: Each issue must have clear acceptance criteria and testing requirements

## Quality Tools

Before completing any work, **always run the quality tools** to ensure code meets project standards:

### Required Quality Checks

Run these commands in sequence after completing your work:

```bash
npm run format     # Format all code with Prettier
npm run lint       # Check for ESLint violations
npm run test       # Run the test suite
```

### Additional Commands

- `npm run format:check` - Check if code is properly formatted without making changes
- `npm run format:src` - Format only source files in the `src/` directory

### Development Commands

- `npm start` - Start the React Native Metro bundler
- `npm run android` - Run the app on Android
- `npm run ios` - Run the app on iOS

**Critical:** Always run `format`, `lint`, and `test` before submitting any code changes.
