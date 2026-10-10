const config = {
  plugins: {
    // optimize:false disables Tailwind v4's native lightningcss optimize/minify
    // step, which intermittently corrupts this project's generated CSS on this
    // host (emits garbage bytes → PostCSS "Missed semicolon", breaking the
    // production build). CSS ships unminified — a negligible size bump, gzipped.
    "@tailwindcss/postcss": { optimize: false },
  },
};

export default config;
