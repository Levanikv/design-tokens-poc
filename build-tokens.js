import StyleDictionary from 'style-dictionary';
import { register } from '@tokens-studio/sd-transforms';

// Register Tokens Studio transforms
register(StyleDictionary, {
  excludeParentKeys: true,
});

// Helper to convert any color value to Compose Color format
function toComposeColor(value) {
  if (!value || typeof value !== 'string') return null;

  // Skip unresolved references
  if (value.startsWith('{') && value.endsWith('}')) return null;

  // Handle rgba format
  const rgbaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const alpha = a !== undefined ? Math.round(parseFloat(a) * 255) : 255;
    const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
    const red = parseInt(r).toString(16).padStart(2, '0').toUpperCase();
    const green = parseInt(g).toString(16).padStart(2, '0').toUpperCase();
    const blue = parseInt(b).toString(16).padStart(2, '0').toUpperCase();
    return `Color(0x${alphaHex}${red}${green}${blue})`;
  }

  // Handle hex format (6 digits)
  const hexMatch = value.match(/^#([A-Fa-f0-9]{6})$/);
  if (hexMatch) {
    return `Color(0xFF${hexMatch[1].toUpperCase()})`;
  }

  // Handle hex format (8 digits - with alpha)
  const hexAlphaMatch = value.match(/^#([A-Fa-f0-9]{8})$/);
  if (hexAlphaMatch) {
    const hex = hexAlphaMatch[1].toUpperCase();
    // CSS is RRGGBBAA, Compose needs AARRGGBB
    return `Color(0x${hex.slice(6)}${hex.slice(0, 6)})`;
  }

  return null;
}

// Helper to convert token path to Kotlin name (primitives)
function toPrimitiveKotlinName(path) {
  return path
    .map((part, index) => {
      if (/^\d/.test(part)) part = `_${part}`;
      part = part.replace(/-temp$/, 'Temp');
      const camelPart = part.replace(/-([a-zA-Z0-9])/g, (_, char) => char.toUpperCase());
      if (index === 0) return camelPart.charAt(0).toLowerCase() + camelPart.slice(1);
      return camelPart.charAt(0).toUpperCase() + camelPart.slice(1);
    })
    .join('');
}

// Custom format: Kotlin Compose Colors object for primitives
StyleDictionary.registerFormat({
  name: 'compose/primitives',
  format: ({ dictionary, options }) => {
    const packageName = options.packageName || 'com.example.tokens';
    const objectName = options.objectName || 'Colors';

    const tokens = dictionary.allTokens
      .filter(token => (token.$type || token.type) === 'color')
      .map(token => {
        const value = token.value || token.$value;
        const composeColor = toComposeColor(value);
        if (!composeColor) return null;
        const name = toPrimitiveKotlinName(token.path);
        return `    val ${name} = ${composeColor}`;
      })
      .filter(Boolean)
      .join('\n');

    return `package ${packageName}

import androidx.compose.ui.graphics.Color

object ${objectName} {
${tokens}
}
`;
  }
});

// Custom format: Kotlin Compose Colors object for semantic colors
StyleDictionary.registerFormat({
  name: 'compose/semantic',
  format: ({ dictionary, options }) => {
    const packageName = options.packageName || 'com.example.tokens';
    const objectName = options.objectName || 'Colors';

    const tokens = dictionary.allTokens
      .filter(token => (token.$type || token.type) === 'color')
      .map(token => {
        const value = token.value || token.$value;
        const composeColor = toComposeColor(value);
        if (!composeColor) return null;

        // Get clean name from path, removing the wel.sem.color prefix
        const path = token.path;
        const relevantPath = path.slice(3); // Skip 'wel', 'sem', 'color'

        const name = relevantPath
          .map((part, index) => {
            if (/^\d/.test(part)) part = `_${part}`;
            const camelPart = part.replace(/-([a-zA-Z0-9])/g, (_, char) => char.toUpperCase());
            if (index === 0) return camelPart.charAt(0).toLowerCase() + camelPart.slice(1);
            return camelPart.charAt(0).toUpperCase() + camelPart.slice(1);
          })
          .join('');

        return `    val ${name} = ${composeColor}`;
      })
      .filter(Boolean)
      .join('\n');

    return `package ${packageName}

import androidx.compose.ui.graphics.Color

object ${objectName} {
${tokens}
}
`;
  }
});

// Build configuration
async function buildTokens() {
  console.log('Building design tokens for Android Compose...\n');

  // Build primitives (all colors)
  const primitiveSD = new StyleDictionary({
    source: ['tokens/primitives/**/*.json'],
    log: { verbosity: 'default' },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: 'build/kotlin/',
        files: [{
          destination: 'PrimitiveColors.kt',
          format: 'compose/primitives',
          options: {
            packageName: 'com.example.designtokens',
            objectName: 'PrimitiveColors'
          }
        }]
      }
    }
  });
  await primitiveSD.buildAllPlatforms();

  // Build semantic colors - Light mode
  const lightSD = new StyleDictionary({
    source: [
      'tokens/primitives/**/*.json',
      'tokens/brands/all.json',
      'tokens/colorModes/light.json'
    ],
    log: {
      verbosity: 'default',
      errors: { brokenReferences: 'warn' }
    },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: 'build/kotlin/',
        files: [{
          destination: 'LightColors.kt',
          format: 'compose/semantic',
          filter: (token) => {
            return token.path[0] === 'wel' && token.path[1] === 'sem' && token.path[2] === 'color';
          },
          options: {
            packageName: 'com.example.designtokens',
            objectName: 'LightColors'
          }
        }]
      }
    }
  });

  try {
    await lightSD.buildAllPlatforms();
  } catch (e) {
    console.log('Light mode warning:', e.message.split('\n')[0]);
  }

  // Build semantic colors - Dark mode
  const darkSD = new StyleDictionary({
    source: [
      'tokens/primitives/**/*.json',
      'tokens/brands/all.json',
      'tokens/colorModes/dark.json'
    ],
    log: {
      verbosity: 'default',
      errors: { brokenReferences: 'warn' }
    },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: 'build/kotlin/',
        files: [{
          destination: 'DarkColors.kt',
          format: 'compose/semantic',
          filter: (token) => {
            return token.path[0] === 'wel' && token.path[1] === 'sem' && token.path[2] === 'color';
          },
          options: {
            packageName: 'com.example.designtokens',
            objectName: 'DarkColors'
          }
        }]
      }
    }
  });

  try {
    await darkSD.buildAllPlatforms();
  } catch (e) {
    console.log('Dark mode warning:', e.message.split('\n')[0]);
  }

  console.log('\nBuild complete! Output in build/kotlin/');
}

buildTokens().catch(console.error);
