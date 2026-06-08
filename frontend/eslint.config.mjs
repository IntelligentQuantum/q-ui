import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['dist/', 'node_modules/', '.next/', 'out/']),
    tseslint.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
        plugins: { js },
        extends: ['js/recommended'],
        languageOptions: { globals: globals.browser },
        rules:
        {
            'no-undef': 'off',
            'space-before-blocks': 'error',
            'quotes': ['error', 'single'],
            'key-spacing': 'error',
            'semi-spacing': 'error',
            'indent':
            [
                'error',
                4,
                {
                    SwitchCase: 1,
                    // ESLint's core `indent` rule mis-handles JSX; JSX nodes are
                    // excluded so it still checks real TS/JS code without
                    // fighting React markup.
                    ignoredNodes:
                    [
                        'JSXElement', 'JSXElement > *', 'JSXAttribute', 'JSXIdentifier', 'JSXNamespacedName',
                        'JSXMemberExpression', 'JSXSpreadAttribute', 'JSXExpressionContainer', 'JSXOpeningElement',
                        'JSXClosingElement', 'JSXFragment', 'JSXOpeningFragment', 'JSXClosingFragment', 'JSXText',
                        'JSXEmptyExpression', 'JSXSpreadChild'
                    ]
                }
            ],
            'curly': ['error', 'all'],
            'semi': ['error', 'always'],
            'brace-style': ['error', 'allman'],
            'block-spacing': ['error', 'always'],
            'object-curly-spacing': ['error', 'always'],
            'template-curly-spacing': ['error', 'always'],
            'comma-dangle': ['error', 'never'],
            'no-multiple-empty-lines':
            [
                'error',
                {
                    max: 1,
                    maxEOF: 0,
                    maxBOF: 0
                }
            ],
            'no-trailing-spaces': 'error',
            'linebreak-style': ['error', 'unix'],
            // The codebase deliberately puts a call's `(` on the next line
            // (Allman-style calls), which this rule would otherwise flag.
            'no-unexpected-multiline': 'off',
            'no-unused-vars': 'off',

            '@typescript-eslint/explicit-member-accessibility':
            [
                'error',
                {
                    accessibility: 'explicit',
                    overrides:
                    {
                        constructors: 'no-public'
                    }
                }
            ],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-function-return-type': ['off', { allowExpressions: true, allowTypedFunctionExpressions: true }],
            '@typescript-eslint/no-unused-vars':
            [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface']
        }
    }
]);
