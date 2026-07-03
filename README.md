# BadLson Code Editor

BadLson is a personal AI-powered code editor designed to make web development faster, smarter, and more interactive. It combines a multi-pane coding environment with an AI coding assistant that helps developers write, understand, debug, and improve their code.

## Features

### Multi-Pane Code Editor

BadLson provides separate coding spaces for:

* **HTML Editor** — Write and structure your webpage markup.
* **CSS Editor** — Design and style your interface.
* **JavaScript Editor** — Add functionality and interactions.

### AI Coding Assistant

Built-in chat assistance helps you:

* Understand your code
* Find and fix errors
* Improve your implementation
* Get coding suggestions
* Learn programming concepts while building

### Live Preview

See your changes instantly as you write code with a real-time preview environment.

### Responsive Interface

BadLson adapts across devices, providing a smooth coding experience on desktop and mobile screens.

### Developer-Friendly Workspace

Designed with a clean layout for:

* Writing code
* Testing ideas
* Experimenting with designs
* Learning web development

## Why BadLson?

Traditional code editors can feel overwhelming for beginners and slow down quick experimentation. BadLson combines coding and AI assistance in one workspace, helping developers focus more on creating and less on searching for solutions.

## Project Goals

BadLson aims to become a simple but powerful coding companion that helps developers:

* Build websites faster
* Learn through interaction
* Debug problems easily
* Improve coding skills

## Technologies

(Add your technologies here)

Example:

* HTML
* CSS
* JavaScript
* AI API integration
* Code editor framework

## Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/badlson.git
```

Open the project folder:

```bash
cd badlson
```

Run the project using your preferred development environment.

## Usage

1. Open BadLson.
2. Write or paste your HTML, CSS, and JavaScript code.
3. Use the AI assistant to ask questions or improve your code.
4. Preview your project instantly.

## Future Improvements

Planned features:

* More programming language support
* Advanced AI debugging
* Code autocomplete
* Project file management
* Extensions/plugins support
* Cloud project saving

## Contributing

Contributions, suggestions, and ideas are welcome.

If you would like to improve BadLson:

1. Fork the repository
2. Create a new branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

---

Made with ❤️ for developers who want a smarter way to code.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
