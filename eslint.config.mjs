import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    // The scene is imperative GPU code: `useFrame` callbacks run outside React's
    // render cycle and mutate uniforms and object3D transforms in place, which
    // is the documented way to drive react-three-fiber. React Compiler's purity
    // rules are written for render-phase code and only produce false positives
    // here.
    files: ["src/components/scene/**"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
