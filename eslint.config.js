export default [
    {
        files: ["**/*.js"],

        ignores: [
            "server/node_modules/**",
            "node_modules/**"
        ],

        languageOptions: {
            ecmaVersion: "latest",

            sourceType: "module",

            globals: {

                // Browser
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
                fetch: "readonly",
                localStorage: "readonly",
                sessionStorage: "readonly",

                Blob: "readonly",
                URL: "readonly",

                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",

                prompt: "readonly",

                SpeechSynthesisUtterance: "readonly",

                // Node
                console: "readonly",
                process: "readonly",
                TextDecoder: "readonly",
                AbortController: "readonly"
            }
        },

        rules: {

            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_"
                }
            ]

        }
    }
];
