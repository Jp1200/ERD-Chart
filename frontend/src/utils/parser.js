// parser.js

/**
 * Parses SQL DDL text and returns an object { tables, relationships }
 * Highly robust client-side regex DDL parser.
 */
export function parseSQL(sqlText) {
  const tables = [];
  const relationships = [];
  
  // Clean up sqlText: strip comments
  const cleanSql = sqlText
    .replace(/--.*$/gm, '') // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // multi-line comments
    .replace(/\s+/g, ' '); // normalize spaces
    
  // Split into separate statements by semicolon
  const statements = cleanSql.split(';');
  
  for (let statement of statements) {
    statement = statement.trim();
    if (!statement) continue;
    
    // Check for CREATE TABLE
    const createTableMatch = statement.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_`"]+)\s*\((.*)\)$/i);
    if (createTableMatch) {
      const rawTableName = createTableMatch[1];
      const tableName = rawTableName.replace(/[`"]/g, '');
      const innerContent = createTableMatch[2].trim();
      
      const columns = [];
      const tableConstraints = [];
      
      // Parse columns/constraints inside CREATE TABLE (...)
      // Split by comma, but ignore commas inside parentheses e.g. DECIMAL(10,2), VARCHAR(50)
      const parts = [];
      let current = '';
      let parenCount = 0;
      for (let i = 0; i < innerContent.length; i++) {
        const char = innerContent[i];
        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;
        
        if (char === ',' && parenCount === 0) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (current.trim()) {
        parts.push(current.trim());
      }
      
      // Process each part
      for (let part of parts) {
        part = part.trim();
        if (!part) continue;

        // Check for table constraints
        // 1. PRIMARY KEY table constraint: PRIMARY KEY (col1, col2)
        const pkMatch = part.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkMatch) {
          const pkCols = pkMatch[1].split(',').map(c => c.trim().replace(/[`"]/g, ''));
          tableConstraints.push({ type: 'PK', columns: pkCols });
          continue;
        }
        
        // 2. FOREIGN KEY table constraint: FOREIGN KEY (col) REFERENCES other_table(other_col)
        const fkMatch = part.match(/^FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([a-zA-Z0-9_`"]+)\s*\(([^)]+)\)/i);
        if (fkMatch) {
          const localCol = fkMatch[1].trim().replace(/[`"]/g, '');
          const refTable = fkMatch[2].trim().replace(/[`"]/g, '');
          const refCol = fkMatch[3].trim().replace(/[`"]/g, '');
          tableConstraints.push({ type: 'FK', localCol, refTable, refCol });
          continue;
        }
        
        // Treat as column definition
        const colWords = part.split(/\s+/);
        if (colWords.length < 2) continue;
        
        const colName = colWords[0].replace(/[`"]/g, '');
        
        // Combine data type words until a constraint word is met
        let typeParts = [];
        let index = 1;
        while (index < colWords.length) {
          const word = colWords[index];
          if (/^(PRIMARY|REFERENCES|NOT|NULL|UNIQUE|DEFAULT|AUTO_INCREMENT|KEY|CONSTRAINT)$/i.test(word)) {
            break;
          }
          typeParts.push(word);
          index++;
        }
        
        const colType = typeParts.join(' ');
        const restOfCol = colWords.slice(index).join(' ');
        
        const isPk = /PRIMARY\s+KEY/i.test(restOfCol);
        const isNullable = !/NOT\s+NULL/i.test(restOfCol);
        
        // Check for inline references
        const inlineRefMatch = restOfCol.match(/REFERENCES\s+([a-zA-Z0-9_`"]+)\s*\(([^)]+)\)/i);
        let inlineRef = null;
        if (inlineRefMatch) {
          inlineRef = {
            refTable: inlineRefMatch[1].replace(/[`"]/g, ''),
            refCol: inlineRefMatch[2].replace(/[`"]/g, '')
          };
        }
        
        columns.push({
          name: colName,
          type: colType || 'VARCHAR(255)',
          isPrimaryKey: isPk,
          isNullable: isNullable,
          inlineRef
        });
      }
      
      tables.push({
        id: tableName,
        name: tableName,
        columns: columns,
        position: {
          x: 100 + (tables.length % 3) * 320,
          y: 100 + Math.floor(tables.length / 3) * 280
        }
      });
      
      // Process constraints
      for (const constraint of tableConstraints) {
        if (constraint.type === 'PK') {
          columns.forEach(col => {
            if (constraint.columns.includes(col.name)) {
              col.isPrimaryKey = true;
            }
          });
        } else if (constraint.type === 'FK') {
          relationships.push({
            id: `rel_${tableName}_${constraint.localCol}_to_${constraint.refTable}_${constraint.refCol}`,
            fromTable: tableName,
            fromField: constraint.localCol,
            toTable: constraint.refTable,
            toField: constraint.refCol,
            cardinality: '1:N'
          });
        }
      }
      
      // Process inline references
      columns.forEach(col => {
        if (col.inlineRef) {
          relationships.push({
            id: `rel_${tableName}_${col.name}_to_${col.inlineRef.refTable}_${col.inlineRef.refCol}`,
            fromTable: tableName,
            fromField: col.name,
            toTable: col.inlineRef.refTable,
            toField: col.inlineRef.refCol,
            cardinality: '1:N'
          });
          delete col.inlineRef;
        }
      });
    }
    
    // Check for ALTER TABLE ADD CONSTRAINT FOREIGN KEY
    const alterFkMatch = statement.match(/ALTER\s+TABLE\s+([a-zA-Z0-9_`"]+)\s+ADD\s+(?:CONSTRAINT\s+[a-zA-Z0-9_`"]+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([a-zA-Z0-9_`"]+)\s*\(([^)]+)\)/i);
    if (alterFkMatch) {
      const tableName = alterFkMatch[1].replace(/[`"]/g, '');
      const localCol = alterFkMatch[2].trim().replace(/[`"]/g, '');
      const refTable = alterFkMatch[3].trim().replace(/[`"]/g, '');
      const refCol = alterFkMatch[4].trim().replace(/[`"]/g, '');
      
      relationships.push({
        id: `rel_${tableName}_${localCol}_to_${refTable}_${refCol}`,
        fromTable: tableName,
        fromField: localCol,
        toTable: refTable,
        toField: refCol,
        cardinality: '1:N'
      });
    }
  }
  
  // Mark foreign key columns on the tables
  relationships.forEach(rel => {
    const table = tables.find(t => t.id === rel.fromTable);
    if (table) {
      const col = table.columns.find(c => c.name === rel.fromField);
      if (col) {
        col.isForeignKey = true;
      }
    }
  });
  
  return { tables, relationships };
}

/**
 * Generates SQL DDL text from { tables, relationships } state
 */
export function generateSQL(tables, relationships) {
  let sql = '-- Generated by ERD Maker\n\n';
  
  for (const table of tables) {
    sql += `CREATE TABLE ${table.name} (\n`;
    
    const lines = [];
    
    // Add columns
    table.columns.forEach(col => {
      let colLine = `  ${col.name} ${col.type.toUpperCase()}`;
      if (col.isPrimaryKey) {
        colLine += ' PRIMARY KEY';
      } else if (!col.isNullable) {
        colLine += ' NOT NULL';
      }
      lines.push(colLine);
    });
    
    // Add foreign key constraints
    const tableFks = relationships.filter(r => r.fromTable === table.id);
    tableFks.forEach(fk => {
      lines.push(`  FOREIGN KEY (${fk.fromField}) REFERENCES ${fk.toTable}(${fk.toField})`);
    });
    
    sql += lines.join(',\n');
    sql += '\n);\n\n';
  }
  
  return sql;
}
