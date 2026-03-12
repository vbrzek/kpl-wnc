import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      // Required: editorCards.ts reads this at module scope to initialize the Anthropic client singleton.
      // Without it, anthropicClient is null and all translate tests return 503.
      ANTHROPIC_API_KEY: 'test-key',
    },
  },
});
