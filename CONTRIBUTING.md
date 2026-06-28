# Contributing to Talker AI

## Development Guidelines

### Code Quality & Formatting
- **TypeScript**: Enforce strict typing. Avoid `any` unless absolutely unavoidable. Use shared types from `shared/types.ts` for API contracts.
- **Validation**: Verify all TypeScript compiles: `npm run lint`
- **Styling**: Utility-first Tailwind CSS classes. No separate `.css` files.

### Architecture Guidelines
- **Custom Hooks**: Keep UI focused on rendering. Place complex state in hooks under `src/hooks/`.
- **Server Proxies**: Never call external APIs with credentials from the browser. Use routes in `server/routes/`.
- **Configuration**: Never read `process.env` directly. Add variables to `server/config/env.ts`.
- **Validation**: Add validators to `server/utils/validation.ts` for new request bodies.
- **Error classes**: Throw `AppError` subclasses. Global handler returns consistent JSON.
- **Shared types**: Update `shared/types.ts` when API contracts change. Both frontend and backend import from here.

## Pull Request Workflow

1. Fork and create a feature branch off `main`.
2. Implement changes aligned with existing style.
3. Verify: `npm run lint` and `npm run build`.
4. Commit with clear messages.
5. Open a pull request explaining the goal and implementation.

