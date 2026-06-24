import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Save, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  FileText, 
  Copy, 
  Check, 
  HelpCircle, 
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import { parseSQL, generateSQL } from './utils/parser';

// Math constants matching index.css styles
const TABLE_WIDTH = 250;
const HEADER_HEIGHT = 42;
const ROW_HEIGHT = 32;

function App() {
  // Main state
  const [tables, setTables] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState(null);
  
  // Pan and Zoom
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging tables
  const [draggingTableId, setDraggingTableId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Connections dragging state
  const [connectingSocket, setConnectingSocket] = useState(null); // { tableId, columnName, side, x, y }
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [hoveredSocket, setHoveredSocket] = useState(null); // { tableId, columnName, side }

  // CLI/File Config
  const [config, setConfig] = useState({ targetFile: null, targetPath: null });
  const [savePathInput, setSavePathInput] = useState('');

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [importSqlText, setImportSqlText] = useState('');
  const [exportSqlText, setExportSqlText] = useState('');
  
  // UI indicators
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef(null);

  // Show a brief toast message
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch local server config and load initial file if exists
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        if (data.targetFile) {
          setSavePathInput(data.targetFile);
          loadSchemaFromFile();
        } else {
          // Default initial tables if empty project
          setTables([
            {
              id: 'users',
              name: 'users',
              position: { x: 150, y: 120 },
              columns: [
                { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
                { name: 'username', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
                { name: 'email', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: true },
                { name: 'created_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: true }
              ]
            },
            {
              id: 'posts',
              name: 'posts',
              position: { x: 550, y: 180 },
              columns: [
                { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false },
                { name: 'title', type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
                { name: 'body', type: 'TEXT', isPrimaryKey: false, isNullable: true },
                { name: 'user_id', type: 'INT', isPrimaryKey: false, isNullable: false, isForeignKey: true }
              ]
            }
          ]);
          setRelationships([
            {
              id: 'rel_posts_user_id_to_users_id',
              fromTable: 'posts',
              fromField: 'user_id',
              toTable: 'users',
              toField: 'id',
              cardinality: '1:N'
            }
          ]);
        }
      })
      .catch(() => {
        console.log('Running without local server (standalone mode).');
      });
  }, []);

  const loadSchemaFromFile = () => {
    fetch('/api/load')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(data => {
        if (data.tables) {
          setTables(data.tables);
          setRelationships(data.relationships || []);
          showToast('Schema loaded successfully!');
        }
      })
      .catch(err => {
        showToast('Error loading schema: ' + err.message);
      });
  };

  // Save to local file via API
  const saveSchemaToFile = (customPath = null) => {
    const fileToSave = customPath || config.targetPath || savePathInput;
    if (!fileToSave) {
      showToast('Please enter a filename or path to save.');
      return;
    }

    const payload = {
      data: { tables, relationships },
      filePath: fileToSave
    };

    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showToast(`Saved to ${data.savedPath}`);
          setConfig(prev => ({ ...prev, targetFile: data.savedPath.split('/').pop(), targetPath: data.savedPath }));
        } else {
          showToast(`Save failed: ${data.error}`);
        }
      })
      .catch(err => {
        showToast(`Save failed: ${err.message}`);
      });
  };

  // Export JSON file to browser
  const exportJsonToBrowser = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ tables, relationships }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${config.targetFile || 'schema'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Downloaded schema JSON file.');
  };

  // Zoom / Pan handlers
  const handleZoom = (factor) => {
    setZoom(prev => Math.max(0.2, Math.min(2.5, prev * factor)));
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 100, y: 100 });
  };

  const handleGridPointerDown = (e) => {
    // Left click on background grid to pan
    if (e.button === 0 && e.target.classList.contains('canvas-grid')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handlePointerMove = (e) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    // Pan canvas
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    // Drag table
    if (draggingTableId) {
      // Calculate new position in canvas coordinates
      const x = (e.clientX - canvasRect.left - dragOffset.x - pan.x) / zoom;
      const y = (e.clientY - canvasRect.top - dragOffset.y - pan.y) / zoom;
      
      // Grid snapping (optional, e.g. snap to 8px)
      const snapTo = 8;
      const snappedX = Math.round(x / snapTo) * snapTo;
      const snappedY = Math.round(y / snapTo) * snapTo;

      setTables(prev => prev.map(t => 
        t.id === draggingTableId 
          ? { ...t, position: { x: snappedX, y: snappedY } }
          : t
      ));
      return;
    }

    // Dragging relationship connection
    if (connectingSocket) {
      setPointerPos({
        x: (e.clientX - canvasRect.left - pan.x) / zoom,
        y: (e.clientY - canvasRect.top - pan.y) / zoom
      });
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    setDraggingTableId(null);

    // Create relationship if connection was successfully dropped on a socket
    if (connectingSocket && hoveredSocket) {
      const { tableId: fromT, columnName: fromCol } = connectingSocket;
      const { tableId: toT, columnName: toCol } = hoveredSocket;

      if (fromT !== toT) {
        // Prevent duplicate relationships
        const relId = `rel_${fromT}_${fromCol}_to_${toT}_${toCol}`;
        const exists = relationships.some(r => r.id === relId);

        if (!exists) {
          const newRel = {
            id: relId,
            fromTable: fromT,
            fromField: fromCol,
            toTable: toT,
            toField: toCol,
            cardinality: '1:N'
          };
          setRelationships(prev => [...prev, newRel]);
          
          // Mark columns as keys
          setTables(prev => prev.map(t => {
            if (t.id === fromT) {
              return {
                ...t,
                columns: t.columns.map(c => c.name === fromCol ? { ...c, isForeignKey: true } : c)
              };
            }
            return t;
          }));

          showToast(`Connected ${fromT}.${fromCol} ➔ ${toT}.${toCol}`);
        }
      }
    }
    setConnectingSocket(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;

    const zoomIntensity = 0.1;
    const wheelFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    const newZoom = Math.max(0.2, Math.min(2.5, zoom * wheelFactor));

    // Zoom centered at mouse position
    setPan(prev => ({
      x: mouseX - (mouseX - prev.x) * (newZoom / zoom),
      y: mouseY - (mouseY - prev.y) * (newZoom / zoom)
    }));
    setZoom(newZoom);
  };

  // Table actions
  const handleAddTable = () => {
    const newId = `table_${Date.now()}`;
    const newName = `new_table_${tables.length + 1}`;
    
    // Put new table near center of view
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const centerX = (canvasRect.width / 2 - pan.x) / zoom;
    const centerY = (canvasRect.height / 2 - pan.y) / zoom;

    const newTable = {
      id: newId,
      name: newName,
      position: { x: centerX - 125, y: centerY - 100 },
      columns: [
        { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false }
      ]
    };

    setTables(prev => [...prev, newTable]);
    setSelectedTableId(newId);
  };

  const handleDuplicateTable = (tableToDuplicate) => {
    const newId = `table_${Date.now()}`;
    const newName = `${tableToDuplicate.name}_copy`;
    const newTable = {
      ...tableToDuplicate,
      id: newId,
      name: newName,
      position: {
        x: tableToDuplicate.position.x + 30,
        y: tableToDuplicate.position.y + 30
      },
      columns: tableToDuplicate.columns.map(c => ({ ...c }))
    };
    setTables(prev => [...prev, newTable]);
    setSelectedTableId(newId);
    showToast(`Duplicated table ${tableToDuplicate.name}`);
  };

  const handleDeleteTable = (tableId) => {
    setTables(prev => prev.filter(t => t.id !== tableId));
    setRelationships(prev => prev.filter(r => r.fromTable !== tableId && r.toTable !== tableId));
    if (selectedTableId === tableId) {
      setSelectedTableId(null);
    }
    showToast(`Deleted table`);
  };

  // Selected Table column modifications
  const handleUpdateTableName = (tableId, newName) => {
    // Sanitize name: remove spaces and special characters
    const sanitized = newName.replace(/[^a-zA-Z0-9_]/g, '');
    
    // Update relationship references as well
    setRelationships(prev => prev.map(r => {
      let updated = { ...r };
      if (r.fromTable === tableId) updated.fromTable = sanitized;
      if (r.toTable === tableId) updated.toTable = sanitized;
      return updated;
    }));

    setTables(prev => prev.map(t => 
      t.id === tableId 
        ? { ...t, id: sanitized, name: sanitized }
        : t
    ));

    setSelectedTableId(sanitized);
  };

  const handleAddColumn = (tableId) => {
    setTables(prev => prev.map(t => {
      if (t.id === tableId) {
        const newColName = `col_${t.columns.length + 1}`;
        return {
          ...t,
          columns: [...t.columns, { name: newColName, type: 'VARCHAR(255)', isPrimaryKey: false, isNullable: true }]
        };
      }
      return t;
    }));
  };

  const handleUpdateColumn = (tableId, columnIndex, fieldUpdates) => {
    setTables(prev => prev.map(t => {
      if (t.id === tableId) {
        const oldColName = t.columns[columnIndex].name;
        const newColName = fieldUpdates.name !== undefined ? fieldUpdates.name.replace(/[^a-zA-Z0-9_]/g, '') : oldColName;

        const updatedCols = t.columns.map((col, idx) => {
          if (idx === columnIndex) {
            return { ...col, ...fieldUpdates, name: newColName };
          }
          return col;
        });

        // If column name changed, update relationship references to this column
        if (oldColName !== newColName) {
          setRelationships(prevRels => prevRels.map(r => {
            let updated = { ...r };
            if (r.fromTable === tableId && r.fromField === oldColName) updated.fromField = newColName;
            if (r.toTable === tableId && r.toField === oldColName) updated.toField = newColName;
            return updated;
          }));
        }

        return { ...t, columns: updatedCols };
      }
      return t;
    }));
  };

  const handleDeleteColumn = (tableId, columnName) => {
    setTables(prev => prev.map(t => {
      if (t.id === tableId) {
        return {
          ...t,
          columns: t.columns.filter(c => c.name !== columnName)
        };
      }
      return t;
    }));
    // Remove relations tied to this column
    setRelationships(prev => prev.filter(r => 
      !(r.fromTable === tableId && r.fromField === columnName) &&
      !(r.toTable === tableId && r.toField === columnName)
    ));
  };

  // SQL Import / Export
  const handleImportSql = () => {
    try {
      const parsed = parseSQL(importSqlText);
      if (parsed.tables.length === 0) {
        showToast('No tables found in SQL statement. Verify your DDL.');
        return;
      }
      setTables(parsed.tables);
      setRelationships(parsed.relationships);
      setIsImportModalOpen(false);
      showToast(`Successfully imported ${parsed.tables.length} tables!`);
    } catch (e) {
      alert(`Import error: ${e.message}`);
    }
  };

  const openExportModal = () => {
    const generated = generateSQL(tables, relationships);
    setExportSqlText(generated);
    setIsExportModalOpen(true);
  };

  const copyExportSql = () => {
    navigator.clipboard.writeText(exportSqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculations for connection line paths
  const getSocketCoordinates = (tableId, columnName, side) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return { x: 0, y: 0 };

    const colIndex = table.columns.findIndex(c => c.name === columnName);
    const x = table.position.x + (side === 'right' ? TABLE_WIDTH : 0);
    const y = table.position.y + HEADER_HEIGHT + (colIndex * ROW_HEIGHT) + ROW_HEIGHT / 2;
    
    return { x, y };
  };

  const activeTable = tables.find(t => t.id === selectedTableId);

  return (
    <div 
      className="app-container"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Toast Alert */}
      {toast && (
        <div className="toast">
          <span>{toast}</span>
        </div>
      )}

      {/* Sidebar - Schema Outline */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-logo">
            <Database size={22} className="text-primary" />
            <span>ERD Maker</span>
          </h1>
        </div>
        
        <div className="sidebar-content">
          <div style={{ marginBottom: '1.5rem' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleAddTable}>
              <Plus size={16} /> Add New Table
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Tables ({tables.length})
            </h4>
            
            {tables.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                No tables created yet.
              </div>
            ) : (
              <div className="outline-list">
                {tables.map(t => (
                  <div 
                    key={t.id} 
                    className={`outline-item ${selectedTableId === t.id ? 'active' : ''}`}
                    onClick={() => setSelectedTableId(t.id)}
                  >
                    <div className="outline-info">
                      <Database size={14} />
                      <span>{t.name}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t.columns.length} cols
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Local File Save / Config panel */}
        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="form-group">
            <label style={{ fontSize: '0.7rem' }}>Project Schema File</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="form-control flex-1" 
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                placeholder="schema.json" 
                value={savePathInput}
                onChange={(e) => setSavePathInput(e.target.value)}
              />
              <button 
                className="btn" 
                style={{ padding: '0.4rem' }} 
                onClick={() => saveSchemaToFile()} 
                title="Save locally"
              >
                <Save size={16} />
              </button>
            </div>
            {config.targetFile && (
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <FolderOpen size={10} /> Active sync: {config.targetFile}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Workspace Canvas */}
      <main className="workspace-container" ref={canvasRef} onWheel={handleWheel}>
        {/* Floating Controls Overlay */}
        <div className="controls-panel">
          <div className="controls-group">
            {config.targetFile ? (
              <div className="glass-panel file-indicator">
                <Database size={16} className="text-primary" />
                <span>{config.targetFile}</span>
              </div>
            ) : (
              <div className="glass-panel file-indicator" style={{ color: 'var(--text-muted)' }}>
                <span>Unsaved Schema</span>
              </div>
            )}
          </div>

          <div className="controls-group">
            {/* Import / Export DDL */}
            <div className="glass-panel">
              <button className="btn" onClick={() => { setImportSqlText(''); setIsImportModalOpen(true); }}>
                <Upload size={16} />
                <span>Import SQL</span>
              </button>
              <button className="btn" onClick={openExportModal}>
                <Download size={16} />
                <span>Export SQL</span>
              </button>
              <div className="divider"></div>
              <button className="btn" onClick={exportJsonToBrowser} title="Export JSON Diagram File">
                <FileText size={16} />
                <span>Export JSON</span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="glass-panel">
              <button className="btn" onClick={() => handleZoom(1.15)} title="Zoom In">
                <ZoomIn size={16} />
              </button>
              <button className="btn" onClick={() => handleZoom(0.85)} title="Zoom Out">
                <ZoomOut size={16} />
              </button>
              <button className="btn" onClick={resetZoom} title="Reset view">
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Panning Grid */}
        <div 
          className="canvas-grid" 
          onPointerDown={handleGridPointerDown}
        />

        {/* Interactive transformed area */}
        <div 
          className="canvas-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Connection Lines (behind tables) */}
          <svg className="svg-connection-layer">
            {/* Markers for relationship directions */}
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="var(--primary)" />
              </marker>
            </defs>

            {/* Render Saved Relationships */}
            {relationships.map(rel => {
              // Decide connector sides.
              // If source table is to the left of dest table, source goes right, dest goes left
              const srcTable = tables.find(t => t.id === rel.fromTable);
              const destTable = tables.find(t => t.id === rel.toTable);
              
              if (!srcTable || !destTable) return null;

              const srcSide = srcTable.position.x < destTable.position.x ? 'right' : 'left';
              const destSide = destTable.position.x < srcTable.position.x ? 'right' : 'left';

              const start = getSocketCoordinates(rel.fromTable, rel.fromField, srcSide);
              const end = getSocketCoordinates(rel.toTable, rel.toField, destSide);

              const dx = Math.abs(end.x - start.x) * 0.45;
              const pathStr = `M ${start.x} ${start.y} C ${start.x + (srcSide === 'right' ? dx : -dx)} ${start.y}, ${end.x + (destSide === 'right' ? dx : -dx)} ${end.y}, ${end.x} ${end.y}`;

              const isActive = selectedRelationshipId === rel.id;

              return (
                <g key={rel.id}>
                  {/* Invisible thicker path to make hovering/selecting easier */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRelationshipId(isActive ? null : rel.id);
                    }}
                  />
                  {/* Visual path */}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.25)'}
                    strokeWidth={isActive ? 3 : 1.5}
                    className={`relationship-line ${isActive ? 'relationship-line-active' : ''}`}
                    markerEnd="url(#arrow)"
                  />
                  
                  {/* Cardinality tags near start/end points */}
                  <text 
                    x={start.x + (srcSide === 'right' ? 10 : -18)} 
                    y={start.y - 4} 
                    className="relationship-handle-text"
                  >
                    1
                  </text>
                  <text 
                    x={end.x + (destSide === 'right' ? 10 : -18)} 
                    y={end.y - 4} 
                    className="relationship-handle-text"
                  >
                    N
                  </text>
                </g>
              );
            })}

            {/* Render Preview Connection line when dragging */}
            {connectingSocket && (
              (() => {
                const start = getSocketCoordinates(connectingSocket.tableId, connectingSocket.columnName, connectingSocket.side);
                const end = pointerPos;
                const srcSide = connectingSocket.side;
                
                const dx = Math.abs(end.x - start.x) * 0.5;
                const pathStr = `M ${start.x} ${start.y} C ${start.x + (srcSide === 'right' ? dx : -dx)} ${start.y}, ${end.x} ${end.y}, ${end.x} ${end.y}`;

                return (
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                );
              })()
            )}
          </svg>

          {/* Render Table Cards */}
          {tables.map(table => {
            const isSelected = selectedTableId === table.id;

            return (
              <div 
                key={table.id}
                className={`table-card ${isSelected ? 'selected' : ''}`}
                style={{
                  left: table.position.x,
                  top: table.position.y,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedTableId(table.id);
                }}
              >
                {/* Table Header / Draggable handle */}
                <div 
                  className="table-header"
                  onPointerDown={(e) => {
                    if (e.target.closest('.table-action-btn')) return; // ignore action buttons
                    e.stopPropagation();
                    const rect = e.currentTarget.closest('.table-card').getBoundingClientRect();
                    setDraggingTableId(table.id);
                    setDragOffset({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top
                    });
                  }}
                >
                  <div className="table-title">
                    <Database size={14} className="text-primary" />
                    <span>{table.name}</span>
                  </div>
                  <div className="table-actions">
                    <button 
                      className="table-action-btn" 
                      onClick={() => handleDuplicateTable(table)}
                      title="Duplicate Table"
                    >
                      <Copy size={12} />
                    </button>
                    <button 
                      className="table-action-btn delete" 
                      onClick={() => handleDeleteTable(table.id)}
                      title="Delete Table"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Table Columns List */}
                <div className="table-columns">
                  {table.columns.map((col, idx) => (
                    <div key={col.name} className="column-row">
                      {/* Left socket connection */}
                      <div 
                        className="socket left"
                        data-socket-table={table.id}
                        data-socket-column={col.name}
                        data-socket-side="left"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const canvasRect = canvasRef.current.getBoundingClientRect();
                          setConnectingSocket({ tableId: table.id, columnName: col.name, side: 'left' });
                          setPointerPos({
                            x: (e.clientX - canvasRect.left - pan.x) / zoom,
                            y: (e.clientY - canvasRect.top - pan.y) / zoom
                          });
                        }}
                        onPointerEnter={() => setHoveredSocket({ tableId: table.id, columnName: col.name, side: 'left' })}
                        onPointerLeave={() => setHoveredSocket(null)}
                      />

                      {/* Column Info */}
                      <div className="column-info">
                        <span className="column-name">{col.name}</span>
                        <span className="column-type">{col.type}</span>
                      </div>

                      {/* Column Keys badges (PK, FK) */}
                      <div className="column-keys">
                        {col.isPrimaryKey && <span className="key-badge pk">PK</span>}
                        {col.isForeignKey && <span className="key-badge fk">FK</span>}
                      </div>

                      {/* Right socket connection */}
                      <div 
                        className="socket right"
                        data-socket-table={table.id}
                        data-socket-column={col.name}
                        data-socket-side="right"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const canvasRect = canvasRef.current.getBoundingClientRect();
                          setConnectingSocket({ tableId: table.id, columnName: col.name, side: 'right' });
                          setPointerPos({
                            x: (e.clientX - canvasRect.left - pan.x) / zoom,
                            y: (e.clientY - canvasRect.top - pan.y) / zoom
                          });
                        }}
                        onPointerEnter={() => setHoveredSocket({ tableId: table.id, columnName: col.name, side: 'right' })}
                        onPointerLeave={() => setHoveredSocket(null)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Right Sidebar - Column details & Table Editor */}
      <aside className="editor-panel">
        <div className="panel-header">
          <h3>Schema Editor</h3>
          {selectedRelationshipId && (
            <button 
              className="btn btn-danger" 
              style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => {
                setRelationships(prev => prev.filter(r => r.id !== selectedRelationshipId));
                setSelectedRelationshipId(null);
                showToast('Relationship deleted');
              }}
            >
              <Trash2 size={12} /> Remove Relation
            </button>
          )}
        </div>

        <div className="panel-content">
          {activeTable ? (
            <>
              {/* Table Name */}
              <div className="form-group">
                <label>Table Name</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={activeTable.name}
                  onChange={(e) => handleUpdateTableName(activeTable.id, e.target.value)}
                />
              </div>

              {/* Column Listing & Add column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Columns
                  </h4>
                  <button 
                    className="btn" 
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} 
                    onClick={() => handleAddColumn(activeTable.id)}
                  >
                    <Plus size={12} /> Add Field
                  </button>
                </div>

                <div className="edit-columns-list">
                  {activeTable.columns.map((col, idx) => (
                    <div key={idx} className="edit-column-item">
                      <div className="edit-column-row">
                        <input 
                          type="text" 
                          placeholder="field_name"
                          className="form-control flex-1"
                          value={col.name}
                          onChange={(e) => handleUpdateColumn(activeTable.id, idx, { name: e.target.value })}
                        />
                        <select 
                          className="form-control" 
                          style={{ width: '120px' }}
                          value={col.type.split('(')[0].toUpperCase()} // check base type e.g. VARCHAR
                          onChange={(e) => {
                            let typeVal = e.target.value;
                            if (typeVal === 'VARCHAR') typeVal = 'VARCHAR(255)';
                            handleUpdateColumn(activeTable.id, idx, { type: typeVal });
                          }}
                        >
                          <option value="INT">INT</option>
                          <option value="BIGINT">BIGINT</option>
                          <option value="VARCHAR">VARCHAR</option>
                          <option value="TEXT">TEXT</option>
                          <option value="BOOLEAN">BOOLEAN</option>
                          <option value="TIMESTAMP">TIMESTAMP</option>
                          <option value="DATE">DATE</option>
                          <option value="DECIMAL">DECIMAL</option>
                          <option value="FLOAT">FLOAT</option>
                        </select>
                        <button 
                          className="table-action-btn delete" 
                          style={{ padding: '0.35rem' }}
                          onClick={() => handleDeleteColumn(activeTable.id, col.name)}
                          title="Delete column"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Flags */}
                      <div className="checkbox-group">
                        <label className="checkbox-label">
                          <input 
                            type="checkbox"
                            checked={col.isPrimaryKey || false}
                            onChange={(e) => handleUpdateColumn(activeTable.id, idx, { isPrimaryKey: e.target.checked })}
                          />
                          <span>Primary Key (PK)</span>
                        </label>
                        <label className="checkbox-label">
                          <input 
                            type="checkbox"
                            checked={col.isNullable || false}
                            onChange={(e) => handleUpdateColumn(activeTable.id, idx, { isNullable: e.target.checked })}
                          />
                          <span>Nullable</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Table Deletion Help info */}
              <div className="tip-box">
                💡 <strong>Connection tip:</strong> Drag from a column's socket (dots on left/right edges) and drop it onto another table's column socket to establish a 1-to-many relationship!
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Database size={48} style={{ opacity: 0.2 }} />
              <div className="empty-state-title">No Table Selected</div>
              <p style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                Select a table card or create a new one to begin editing columns, types, and schema relationships.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* SQL Import Modal */}
      {isImportModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Import SQL DDL Schema</h3>
              <button className="table-action-btn" onClick={() => setIsImportModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Paste your SQL script (`CREATE TABLE` DDL statements) below to convert it into a visual ERD diagram.
              </p>
              <textarea 
                className="sql-textarea"
                placeholder={`CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE
);

CREATE TABLE posts (
  id INT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  user_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`}
                value={importSqlText}
                onChange={(e) => setImportSqlText(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setIsImportModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleImportSql}>Parse & Import</button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Export Modal */}
      {isExportModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Export SQL DDL Schema</h3>
              <button className="table-action-btn" onClick={() => setIsExportModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Copy the generated SQL script or save it directly to a local SQL file path.
              </p>
              <textarea 
                className="sql-textarea"
                readOnly
                value={exportSqlText}
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {config.targetFile && (
                  <button 
                    className="btn" 
                    onClick={() => {
                      // Attempt to save SQL script next to target file
                      const sqlPath = config.targetPath ? config.targetPath.replace(/\.json$/i, '.sql') : 'schema.sql';
                      fetch('/api/save-sql', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sql: exportSqlText, filePath: sqlPath })
                      })
                        .then(res => res.json())
                        .then(data => {
                          if (data.success) showToast(`SQL saved to ${data.savedPath}`);
                          else showToast(`Failed: ${data.error}`);
                        });
                    }}
                  >
                    <Save size={16} /> Save to SQL file
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn" onClick={copyExportSql}>
                  {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                  <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
                </button>
                <button className="btn btn-primary" onClick={() => setIsExportModalOpen(false)}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
