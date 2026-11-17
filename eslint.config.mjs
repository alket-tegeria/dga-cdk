import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default defineConfig(
  {
    ignores: [
      '**/*.js',
      '**/node_modules/**',
      '**/cdk.out/**',
      '**/dist/**',
      '**/build/**',
      '**/.build/**',
      '**/coverage/**',
      '**/handlerTest.ts',
      '**/*.d.ts',
      '**/*.test.ts' // Consider if you want different rules for tests
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2026
      },
      parserOptions: {
        ecmaVersion: 'latest',
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    rules: {
      curly: ['error', 'all'],
      'no-bitwise': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
          fixStyle: 'inline-type-imports'
        }
      ],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  },
  eslintPluginPrettierRecommended
)
