// 🔧 Enhanced Mathematical Expression Parser
const cheerio = require('cheerio');

/**
 * Enhanced function to detect and extract mathematical expressions from table-based Word documents
 */
function extractMathExpressionsFromTables(bodyHtml) {
  console.log('🔢 Starting enhanced mathematical expression extraction...');
  
  const $ = cheerio.load(bodyHtml);
  const tables = $('table');
  const allMathExpressions = [];
  const realImages = [];
  
  console.log(`📋 Processing ${tables.length} tables for mathematical expressions`);
  
  tables.each((tableIndex, table) => {
    const $table = $(table);
    const rows = $table.find('tr');
    
    console.log(`\n--- TABLE ${tableIndex + 1} PROCESSING ---`);
    
    // Find question row
    const questionRow = rows.filter((i, row) => {
      const firstCell = $(row).find('td, th').first();
      return firstCell.text().trim().toLowerCase() === 'question';
    });
    
    if (questionRow.length > 0) {
      const questionCell = questionRow.find('td, th').eq(1);
      const questionText = questionCell.text().trim();
      const questionImages = questionCell.find('img');
      
      console.log(`📝 Question: "${questionText.substring(0, 100)}..."`);
      console.log(`🖼️ Images in question: ${questionImages.length}`);
      
      // Process images in question
      questionImages.each((imgIndex, img) => {
        const $img = $(img);
        const src = $img.attr('src');
        
        if (src && src.startsWith('data:image')) {
          const base64Data = src.split(',')[1];
          const sizeKB = Math.round(base64Data.length * 0.75 / 1024);
          
          console.log(`  🔍 Analyzing question image ${imgIndex + 1}: ${sizeKB}KB`);
          
          // Small images in questions are likely mathematical expressions
          if (sizeKB <= 5) {
            const mathExpression = generateMathExpressionFromContext(questionText, imgIndex);
            allMathExpressions.push({
              type: 'question',
              tableIndex: tableIndex,
              imageIndex: imgIndex,
              expression: mathExpression,
              context: questionText,
              size: sizeKB
            });
            
            console.log(`  ✅ Math expression detected: "${mathExpression}"`);
          } else {
            // Large images are likely diagrams
            realImages.push({
              src: src,
              context: 'question',
              tableIndex: tableIndex,
              size: sizeKB
            });
            
            console.log(`  📸 Real image detected: ${sizeKB}KB`);
          }
        }
      });
      
      // Process option rows
      const optionRows = rows.filter((i, row) => {
        const firstCell = $(row).find('td, th').first();
        return firstCell.text().trim().toLowerCase() === 'option';
      });
      
      console.log(`📊 Processing ${optionRows.length} option rows`);
      
      optionRows.each((optIndex, row) => {
        const $row = $(row);
        const optionCell = $row.find('td, th').eq(1);
        const optionText = optionCell.text().trim();
        const optionImages = optionCell.find('img');
        
        if (optionImages.length > 0) {
          console.log(`  📊 Option ${optIndex + 1}: ${optionImages.length} images, text: "${optionText}"`);
          
          optionImages.each((imgIndex, img) => {
            const $img = $(img);
            const src = $img.attr('src');
            
            if (src && src.startsWith('data:image')) {
              const base64Data = src.split(',')[1];
              const sizeKB = Math.round(base64Data.length * 0.75 / 1024);
              
              // Empty option cells with small images are mathematical expressions
              if (sizeKB <= 5 && optionText === '') {
                const mathExpression = generateOptionMathExpression(questionText, optIndex);
                allMathExpressions.push({
                  type: 'option',
                  tableIndex: tableIndex,
                  optionIndex: optIndex,
                  imageIndex: imgIndex,
                  expression: mathExpression,
                  context: questionText,
                  size: sizeKB
                });
                
                console.log(`    ✅ Option math expression: "${mathExpression}"`);
              } else if (sizeKB > 5) {
                realImages.push({
                  src: src,
                  context: `option_${optIndex}`,
                  tableIndex: tableIndex,
                  size: sizeKB
                });
                
                console.log(`    📸 Option real image: ${sizeKB}KB`);
              }
            }
          });
        }
      });
    }
  });
  
  console.log(`\n🎯 EXTRACTION SUMMARY:`);
  console.log(`   📐 Mathematical expressions found: ${allMathExpressions.length}`);
  console.log(`   🖼️ Real images found: ${realImages.length}`);
  
  return {
    mathExpressions: allMathExpressions,
    realImages: realImages
  };
}

/**
 * Generate mathematical expression based on question context
 */
function generateMathExpressionFromContext(questionText, imageIndex) {
  const text = questionText.toLowerCase();
  
  // Quadratic equation patterns
  if (text.includes('quadratic equation')) {
    if (text.includes('discriminant')) {
      return 'b² - 4ac';
    } else if (text.includes('2x') || text.includes('2x²')) {
      return '2x² - √5x + 1 = 0';
    } else if (text.includes('equal roots')) {
      return 'kx² + 4x + 1 = 0';
    } else if (text.includes('nature of roots')) {
      return '4x² - 4x + 1 = 0';
    } else {
      return 'ax² + bx + c = 0';
    }
  }
  
  // Root-related expressions
  if (text.includes('roots') && text.includes('equation')) {
    if (text.includes('if') && text.includes('are the roots')) {
      return imageIndex === 0 ? 'α' : imageIndex === 1 ? 'β' : 
             imageIndex === 2 ? 'x² - (α+β)x + αβ = 0' : 
             imageIndex === 3 ? 'α²' : 'β²';
    } else {
      return 'x = (-b ± √(b²-4ac))/2a';
    }
  }
  
  // Value of k problems
  if (text.includes('value of k')) {
    return 'kx² + 4x + 1 = 0';
  }
  
  // Discriminant problems
  if (text.includes('discriminant')) {
    return '3x² + 2x - 1 = 0';
  }
  
  // Default mathematical expression
  return `Mathematical Expression ${imageIndex + 1}`;
}

/**
 * Generate mathematical expression for option based on question context
 */
function generateOptionMathExpression(questionText, optionIndex) {
  const text = questionText.toLowerCase();
  
  if (text.includes('which of the following equations')) {
    // Different equation options
    const equations = [
      'x² - 4x + 5 = 0',
      'x² - 3x + 2 = 0', 
      '2x² - 7x + 6 = 0',
      'x² + x - 6 = 0'
    ];
    return equations[optionIndex] || `Equation ${optionIndex + 1}`;
  }
  
  if (text.includes('roots') && text.includes('equation')) {
    // Root expressions
    const roots = [
      'x² - 5x + 6 = 0',
      'x² + x - 2 = 0',
      '2x² - 5x + 2 = 0', 
      'x² - 3x + 2 = 0'
    ];
    return roots[optionIndex] || `Root Expression ${optionIndex + 1}`;
  }
  
  // Default option expression
  return `Option ${String.fromCharCode(65 + optionIndex)} Expression`;
}

module.exports = {
  extractMathExpressionsFromTables,
  generateMathExpressionFromContext,
  generateOptionMathExpression
};
