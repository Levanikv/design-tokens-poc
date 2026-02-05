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

// Helper to convert token path to Kotlin name (primitives) - PascalCase, simplified
function toPrimitiveKotlinName(path) {
  // Join path and remove common prefixes
  const fullName = path.join('-');

  // Remove prefixes like wel-prim-color-leg-, wel-prim-color-, etc.
  let cleanName = fullName
    .replace(/^wel-prim-color-leg-/i, '')
    .replace(/^wel-prim-color-/i, '')
    .replace(/^wel-prim-/i, '')
    .replace(/^wel-/i, '');

  // Handle -temp suffix
  cleanName = cleanName.replace(/-temp$/i, 'Temp');

  // Convert to PascalCase
  return cleanName
    .split('-')
    .map(part => {
      // Handle numbers - don't add underscore, just append
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
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

@Suppress("MagicNumber")
internal object ${objectName} {
${tokens}
}
`;
  }
});

// Custom format: Kotlin Compose Colors object for semantic colors (single mode)
StyleDictionary.registerFormat({
  name: 'compose/semantic',
  format: ({ dictionary, options }) => {
    const packageName = options.packageName || 'com.example.tokens';
    const objectName = options.objectName || 'Colors';

    const tokens = dictionary.allTokens
      .filter(token => {
        if ((token.$type || token.type) !== 'color') return false;
        // Exclude hover and pressed states (not needed for mobile)
        const pathStr = token.path.join('.').toLowerCase();
        if (pathStr.includes('hover') || pathStr.includes('pressed')) return false;
        return true;
      })
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

// Global storage for merged semantic colors
const semanticColorsMap = new Map();

// Custom format: Collect semantic colors for merging
StyleDictionary.registerFormat({
  name: 'compose/semantic-collect',
  format: ({ dictionary, options }) => {
    const mode = options.mode; // 'light' or 'dark'

    dictionary.allTokens
      .filter(token => {
        if ((token.$type || token.type) !== 'color') return false;
        const pathStr = token.path.join('.').toLowerCase();
        if (pathStr.includes('hover') || pathStr.includes('pressed')) return false;
        return true;
      })
      .forEach(token => {
        const value = token.value || token.$value;
        const composeColor = toComposeColor(value);
        if (!composeColor) return;

        const path = token.path;
        const relevantPath = path.slice(3);
        const name = relevantPath
          .map((part, index) => {
            if (/^\d/.test(part)) part = `_${part}`;
            const camelPart = part.replace(/-([a-zA-Z0-9])/g, (_, char) => char.toUpperCase());
            if (index === 0) return camelPart.charAt(0).toLowerCase() + camelPart.slice(1);
            return camelPart.charAt(0).toUpperCase() + camelPart.slice(1);
          })
          .join('');

        if (!semanticColorsMap.has(name)) {
          semanticColorsMap.set(name, {});
        }
        semanticColorsMap.get(name)[mode] = composeColor;
      });

    // Return empty - we'll generate the real file later
    return '';
  }
});

// Function to generate merged semantic colors file
function generateMergedSemanticColors(packageName, objectName) {
  const tokens = Array.from(semanticColorsMap.entries())
    .map(([name, colors]) => {
      const light = colors.light || 'Color.Unspecified';
      const dark = colors.dark || colors.light || 'Color.Unspecified';
      return `    val ${name}
        @Composable
        get() = getColor(light = ${light}, dark = ${dark})`;
    })
    .join('\n\n');

  return `package ${packageName}

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object ${objectName} {
${tokens}
}

@Composable
private fun getColor(light: Color, dark: Color): Color {
    return if (isSystemInDarkTheme()) dark else light
}

@Composable
private fun isSystemInDarkTheme(): Boolean {
    return androidx.compose.foundation.isSystemInDarkTheme()
}
`;
}

// Build configuration
async function buildTokens() {
  console.log('Building design tokens for Android Compose...\n');

  const packageName = 'com.accor.designsystem.compose';

  // Build primitives (all colors)
  const primitiveSD = new StyleDictionary({
    source: ['tokens/primitives/**/*.json'],
    log: { verbosity: 'default' },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: 'build/kotlin/',
        files: [{
          destination: 'AccorColorPrimitives.kt',
          format: 'compose/primitives',
          options: {
            packageName,
            objectName: 'AccorColorPrimitives'
          }
        }]
      }
    }
  });
  await primitiveSD.buildAllPlatforms();

  // Clear the map before collecting
  semanticColorsMap.clear();

  // Collect Light mode colors
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
          destination: '_light_temp.kt',
          format: 'compose/semantic-collect',
          filter: (token) => {
            return token.path[0] === 'wel' && token.path[1] === 'sem' && token.path[2] === 'color';
          },
          options: {
            mode: 'light'
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

  // Collect Dark mode colors
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
          destination: '_dark_temp.kt',
          format: 'compose/semantic-collect',
          filter: (token) => {
            return token.path[0] === 'wel' && token.path[1] === 'sem' && token.path[2] === 'color';
          },
          options: {
            mode: 'dark'
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

  // Generate the merged semantic colors file
  const fs = await import('fs');
  const mergedContent = generateMergedSemanticColors(packageName, 'AccorColorSemantics');
  fs.writeFileSync('build/kotlin/AccorColorSemantics.kt', mergedContent);

  // Clean up temp files
  try {
    fs.unlinkSync('build/kotlin/_light_temp.kt');
    fs.unlinkSync('build/kotlin/_dark_temp.kt');
  } catch (e) {
    // Ignore if files don't exist
  }

  console.log('\nBuild complete! Output in build/kotlin/');
  console.log('  - AccorColorPrimitives.kt');
  console.log('  - AccorColorSemantics.kt');
}

buildTokens().catch(console.error);
