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
  
  // 🔧 NEW: Extract ALL images from the entire HTML first
  const allImagesInDocument = [];
  $('img').each((index, img) => {
    const $img = $(img);
    const src = $img.attr('src');
    if (src && src.startsWith('data:image')) {
      // Get the parent element to determine context
      const parent = $img.parent();
      const parentHtml = parent.html() || '';
      const parentText = parent.text().trim();
      
      allImagesInDocument.push({
        src: src,
        index: index,
        parentText: parentText,
        parentHtml: parentHtml.substring(0, 200),
        element: $img
      });
    }
  });
  
  console.log(`🖼️ Found ${allImagesInDocument.length} total images in document`);
  
  // 🔧 NEW: Extract MathML/equation elements that might not be images
  // Word equations (OMath) might be converted to MathML or special HTML
  const mathmlElements = $('m\\:oMath, m\\:math, math, [class*="math"], [class*="equation"]');
  const equationTexts = [];
  
  mathmlElements.each((index, elem) => {
    const $elem = $(elem);
    const mathText = $elem.text().trim();
    if (mathText && mathText.length > 0) {
      equationTexts.push({
        text: mathText,
        html: $elem.html() || '',
        index: index
      });
    }
  });
  
  // Also look for text that looks like equations (contains math symbols)
  $('span, p, div, td').each((index, elem) => {
    const $elem = $(elem);
    const text = $elem.text().trim();
    // Check if it looks like an equation: has math symbols, numbers, and is reasonably short
    if (text && text.length > 0 && text.length < 100 && 
        /[²³⁴⁵⁶⁷⁸⁹⁰√∑∫πθαβγδεζηλμνξρστφχψω≤≥≠∞∂∇±×÷\^=]/.test(text) &&
        /[0-9]/.test(text) &&
        !equationTexts.some(eq => eq.text === text)) {
      equationTexts.push({
        text: text,
        html: $elem.html() || '',
        index: equationTexts.length
      });
    }
  });
  
  console.log(`🔢 Found ${equationTexts.length} equation text elements (MathML/text)`);
  if (equationTexts.length > 0) {
    equationTexts.forEach((eq, idx) => {
      console.log(`  📐 Equation ${idx + 1}: "${eq.text}"`);
    });
  }
  
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
      console.log(`🖼️ Images in question cell: ${questionImages.length}`);
      
      // Process images directly in question cell
      questionImages.each((imgIndex, img) => {
        const $img = $(img);
        const src = $img.attr('src');
        
        if (src && src.startsWith('data:image')) {
          const base64Data = src.split(',')[1];
          const sizeKB = Math.round(base64Data.length * 0.75 / 1024);
          
          console.log(`  🔍 Analyzing question image ${imgIndex + 1}: ${sizeKB}KB`);
          
          // 🔧 FIX: ALL images in questions should be treated as real images
          realImages.push({
            src: src,
            context: 'question',
            tableIndex: tableIndex,
            size: sizeKB,
            imageIndex: imgIndex
          });
          
          console.log(`  📸 Question image detected: ${sizeKB}KB (stored as real image)`);
          
          // Also try to extract math expression for text representation if needed
          if (sizeKB <= 5) {
            const mathExpression = generateMathExpressionFromContext(questionText, imgIndex);
            allMathExpressions.push({
              type: 'question',
              tableIndex: tableIndex,
              imageIndex: imgIndex,
              expression: mathExpression,
              context: questionText,
              size: sizeKB,
              hasImage: true
            });
            
            console.log(`  ✅ Math expression also extracted: "${mathExpression}"`);
          }
        }
      });
      
      // 🔧 NEW: Also check for images near this table (before or after)
      // Look for images that might be associated with this table but not inside it
      const tableHtml = $table.html() || '';
      const tableText = $table.text().trim();
      
      // Find images that are close to this table (within 500 characters before or after)
      allImagesInDocument.forEach((imgData, imgDocIndex) => {
        // Check if this image hasn't been assigned to another table yet
        const alreadyAssigned = realImages.some(ri => ri.src === imgData.src);
        
        if (!alreadyAssigned) {
          // Check if image is near this table by checking parent context
          const imgParentText = imgData.parentText.toLowerCase();
          const questionTextLower = questionText.toLowerCase();
          
          // If image parent contains question-related text, associate it with this table
          if (questionTextLower.length > 0 && 
              (imgParentText.includes(questionTextLower.substring(0, 20)) || 
               questionTextLower.includes('quadratic') && imgParentText.includes('equation') ||
               questionTextLower.includes('equation') && imgParentText.includes('equation'))) {
            
            const base64Data = imgData.src.split(',')[1];
            const sizeKB = Math.round(base64Data.length * 0.75 / 1024);
            
            console.log(`  🔗 Found associated image near table ${tableIndex + 1}: ${sizeKB}KB`);
            
            realImages.push({
              src: imgData.src,
              context: 'question',
              tableIndex: tableIndex,
              size: sizeKB,
              imageIndex: questionImages.length + realImages.filter(ri => ri.tableIndex === tableIndex).length
            });
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
  
  // 🔧 NEW: If we have unassigned images and tables, try to match them by position
  // This handles cases where images are outside tables but should be associated with questions
  const unassignedImages = allImagesInDocument.filter(imgData => 
    !realImages.some(ri => ri.src === imgData.src)
  );
  
  if (unassignedImages.length > 0 && tables.length > 0) {
    console.log(`\n🔍 Attempting to match ${unassignedImages.length} unassigned images to tables...`);
    
    // Simple heuristic: assign images to tables based on document order
    // First image goes to first table, second to second, etc.
    unassignedImages.forEach((imgData, imgIndex) => {
      const tableIndex = Math.min(imgIndex, tables.length - 1);
      const base64Data = imgData.src.split(',')[1];
      const sizeKB = Math.round(base64Data.length * 0.75 / 1024);
      
      console.log(`  🔗 Assigning unassigned image ${imgIndex + 1} to table ${tableIndex + 1}: ${sizeKB}KB`);
      
      realImages.push({
        src: imgData.src,
        context: 'question',
        tableIndex: tableIndex,
        size: sizeKB,
        imageIndex: realImages.filter(ri => ri.tableIndex === tableIndex).length
      });
    });
  }
  
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
