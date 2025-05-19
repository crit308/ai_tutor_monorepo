import { createConfig } from '@eslint/eslintrc';
import eslintConfigNext from 'eslint-config-next';

export default createConfig({
  extends: [eslintConfigNext],
  ignores: ['node_modules/**/*', '.next/**/*'],
  languageOptions: {
    globals: {
      React: true
    }
  }
}); 