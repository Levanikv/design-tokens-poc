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

// Helper to convert to proper PascalCase for primitives (color names)
function toPascalCasePrimitive(str) {
  return str
    .split('-')
    .map(part => {
      // Handle numbers - just return as is
      if (/^\d+$/.test(part)) return part;
      // Capitalize first letter
      let result = part.charAt(0).toUpperCase() + part.slice(1);
      // Fix compound color words
      result = result
        .replace(/grey/gi, 'Grey')
        .replace(/blue/gi, 'Blue')
        .replace(/green/gi, 'Green')
        .replace(/white/gi, 'White')
        .replace(/black/gi, 'Black')
        .replace(/yellow/gi, 'Yellow')
        .replace(/red/gi, 'Red')
        .replace(/pink/gi, 'Pink')
        .replace(/alpha/gi, 'Alpha')
        .replace(/naval/gi, 'Naval')
        .replace(/royal/gi, 'Royal')
        .replace(/electric/gi, 'Electric')
        .replace(/duck/gi, 'Duck')
        .replace(/lime/gi, 'Lime')
        .replace(/peacock/gi, 'Peacock')
        .replace(/pop/gi, 'Pop')
        .replace(/strawberry/gi, 'Strawberry')
        .replace(/raspberry/gi, 'Raspberry')
        .replace(/fuchsia/gi, 'Fuchsia')
        .replace(/marine/gi, 'Marine')
        .replace(/sky/gi, 'Sky')
        .replace(/tropos/gi, 'Tropos')
        .replace(/stratos/gi, 'Stratos')
        .replace(/platinum/gi, 'Platinum')
        .replace(/diamond/gi, 'Diamond')
        .replace(/gold/gi, 'Gold')
        .replace(/silver/gi, 'Silver')
        .replace(/limitless/gi, 'Limitless')
        .replace(/classic/gi, 'Classic')
        .replace(/temp/gi, 'Temp');
      return result;
    })
    .join('');
}

// Helper to convert to proper PascalCase for semantics
function toPascalCaseSemantic(str) {
  return str
    .split('-')
    .map(part => {
      // Handle numbers - just return as is
      if (/^\d+$/.test(part)) return part;
      // Capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('')
    // Replace Hi with High (but not in middle of word)
    .replace(/Hi$/g, 'High')
    .replace(/Hi([A-Z])/g, 'High$1');
}

// Helper to convert token path to Kotlin name (primitives) - PascalCase, simplified
function toPrimitiveKotlinName(path) {
  // Join path and remove common prefixes
  const fullName = path.join('-');

  // Remove prefixes like wel-prim-color-leg-, wel-prim-color-, etc.
  // Also remove "leg" group entirely
  let cleanName = fullName
    .replace(/^wel-prim-color-leg-/i, '')
    .replace(/^wel-prim-color-/i, '')
    .replace(/^wel-prim-/i, '')
    .replace(/^wel-/i, '')
    .replace(/^leg-/i, '');

  // Handle -temp suffix
  cleanName = cleanName.replace(/-temp$/i, 'Temp');

  // Convert to PascalCase for primitives
  return toPascalCasePrimitive(cleanName);
}

// Custom format: Kotlin Compose Colors object for primitives
StyleDictionary.registerFormat({
  name: 'compose/primitives',
  format: ({ dictionary, options }) => {
    const packageName = options.packageName || 'com.example.tokens';
    const objectName = options.objectName || 'Colors';

    const tokens = dictionary.allTokens
      .filter(token => {
        if ((token.$type || token.type) !== 'color') return false;
        // Exclude "leg" group (wel.prim.color.leg.*)
        if (token.path.includes('leg')) return false;
        return true;
      })
      .map(token => {
        const value = token.value || token.$value;
        const composeColor = toComposeColor(value);
        if (!composeColor) return null;
        const name = toPrimitiveKotlinName(token.path);
        return { name, line: `    val ${name} = ${composeColor}` };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => item.line)
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

// Global storage for primitive token path -> Kotlin name mapping
const primitivePathMap = new Map();

// Global storage for brandbook token path -> primitive Kotlin name mapping
const brandbookPathMap = new Map();

// Custom format: Collect primitive colors for path-based lookup
StyleDictionary.registerFormat({
  name: 'compose/primitives-collect',
  format: ({ dictionary }) => {
    dictionary.allTokens
      .filter(token => (token.$type || token.type) === 'color')
      .forEach(token => {
        const name = toPrimitiveKotlinName(token.path);
        const pathKey = token.path.join('.');
        primitivePathMap.set(pathKey, `AccorColorPrimitives.${name}`);
      });
    return '';
  }
});

// Custom format: Collect brandbook mappings to primitive names
StyleDictionary.registerFormat({
  name: 'compose/brandbook-collect',
  format: ({ dictionary }) => {
    dictionary.allTokens
      .filter(token => (token.$type || token.type) === 'color')
      .forEach(token => {
        const pathKey = token.path.join('.');
        // Get the original reference to find the primitive
        const originalValue = token.original?.$value || token.original?.value;
        if (originalValue && typeof originalValue === 'string') {
          const match = originalValue.match(/^\{(.+)\}$/);
          if (match) {
            const primitivePath = match[1];
            if (primitivePathMap.has(primitivePath)) {
              brandbookPathMap.set(pathKey, primitivePathMap.get(primitivePath));
            }
          }
        }
      });
    return '';
  }
});

// Helper to get primitive reference from semantic token
function getPrimitiveRef(token) {
  const originalValue = token.original?.$value || token.original?.value;
  if (!originalValue || typeof originalValue !== 'string') return null;

  const match = originalValue.match(/^\{(.+)\}$/);
  if (!match) return null;

  const refPath = match[1];

  // Check if it's a direct primitive reference
  if (primitivePathMap.has(refPath)) {
    return primitivePathMap.get(refPath);
  }

  // Check if it's a brandbook reference
  if (brandbookPathMap.has(refPath)) {
    return brandbookPathMap.get(refPath);
  }

  return null;
}

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
        // Only process semantic tokens (wel.sem.color.*)
        if (token.path[0] !== 'wel' || token.path[1] !== 'sem' || token.path[2] !== 'color') return false;
        return true;
      })
      .forEach(token => {
        const value = token.value || token.$value;
        const composeColor = toComposeColor(value);
        if (!composeColor) return;

        const path = token.path;
        const relevantPath = path.slice(3);
        // Convert to PascalCase for semantics (with Hi -> High rule)
        const name = toPascalCaseSemantic(relevantPath.join('-'));

        // Get the primitive reference from the token's original value
        const primitiveRef = getPrimitiveRef(token);

        if (!semanticColorsMap.has(name)) {
          semanticColorsMap.set(name, { order: semanticColorsMap.size });
        }
        // Store the primitive reference if found, otherwise fall back to hex
        semanticColorsMap.get(name)[mode] = primitiveRef || composeColor;
      });

    // Return empty - we'll generate the real file later
    return '';
  }
});

// Function to generate merged semantic colors file
function generateMergedSemanticColors(packageName, objectName) {
  const tokens = Array.from(semanticColorsMap.entries())
    .sort((a, b) => a[1].order - b[1].order) // Keep original JSON order
    .map(([name, colors]) => {
      // Values are already primitive references or hex fallback
      const light = colors.light || 'Color.Unspecified';
      const dark = colors.dark || colors.light || 'Color.Unspecified';
      return `    val ${name}
        @Composable
        get() = getColor(light = ${light}, dark = ${dark})`;
    })
    .join('\n');

  return `package ${packageName}

import androidx.compose.runtime.Composable
import com.accor.designsystem.compose.AccorColor.getColor

object ${objectName} {

${tokens}
}
`;
}

// Build configuration
async function buildTokens() {
  console.log('Building design tokens for Android Compose...\n');

  const packageName = 'com.accor.designsystem.compose';

  // Clear maps before building
  primitivePathMap.clear();
  brandbookPathMap.clear();
  semanticColorsMap.clear();

  // First, collect primitive colors for path-based lookup
  const primitiveCollectSD = new StyleDictionary({
    source: ['tokens/primitives/**/*.json'],
    log: { verbosity: 'silent' },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: 'build/kotlin/',
        files: [{
          destination: '_primitives_temp.kt',
          format: 'compose/primitives-collect'
        }]
      }
    }
  });
  await primitiveCollectSD.buildAllPlatforms();

  // Collect brandbook mappings (brandbook path -> primitive name)
  const brandbookCollectSD = new StyleDictionary({
    source: [
      'tokens/primitives/**/*.json',
      'tokens/brands/brandBook.json'
    ],
    log: {
      verbosity: 'silent',
      errors: { brokenReferences: 'warn' }
    },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: 'build/kotlin/',
        files: [{
          destination: '_brandbook_temp.kt',
          format: 'compose/brandbook-collect',
          filter: (token) => {
            // Only collect brandbook color tokens
            return token.path[0] === 'wel' && token.path[1] === 'web' && token.path[2] === 'bSem';
          }
        }]
      }
    }
  });

  try {
    await brandbookCollectSD.buildAllPlatforms();
  } catch (e) {
    console.log('Brandbook collection warning:', e.message.split('\n')[0]);
  }

  // Build primitives file
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

  // Collect Light mode colors
  const lightSD = new StyleDictionary({
    source: [
      'tokens/primitives/**/*.json',
      'tokens/brands/brandBook.json',
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
      'tokens/brands/brandBook.json',
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
    fs.unlinkSync('build/kotlin/_primitives_temp.kt');
    fs.unlinkSync('build/kotlin/_brandbook_temp.kt');
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
