const projects = new Map();
let projectIdCounter = 1;

export async function listProjects(req, res) {
  try {
    const projectList = Array.from(projects.values());
    res.json({ success: true, projects: projectList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getProject(req, res) {
  try {
    const project = projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function createProject(req, res) {
  try {
    const { name, language = 'html', description = '', template = 'blank' } = req.body;

    const id = `project-${projectIdCounter++}`;
    const now = new Date().toISOString();

    const defaultFiles = getTemplateFiles(template, name);

    const project = {
      id,
      name,
      language,
      description,
      template,
      created: now,
      updated: now,
      files: defaultFiles,
      settings: {
        autoSave: true,
        livePreview: true,
        wordWrap: true,
        tabSize: 2,
      },
    };

    projects.set(id, project);
    res.status(201).json({ success: true, project });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateProject(req, res) {
  try {
    const project = projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { name, description, settings } = req.body;
    if (name) project.name = name;
    if (description) project.description = description;
    if (settings) project.settings = { ...project.settings, ...settings };
    project.updated = new Date().toISOString();

    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteProject(req, res) {
  try {
    const deleted = projects.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getProjectFiles(req, res) {
  try {
    const project = projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, files: project.files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateProjectFiles(req, res) {
  try {
    const project = projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { files } = req.body;
    project.files = { ...project.files, ...files };
    project.updated = new Date().toISOString();

    res.json({ success: true, files: project.files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function getTemplateFiles(template, projectName) {
  const templates = {
    blank: {
      'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${projectName}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello World</h1>\n  <script src="script.js"></script>\n</body>\n</html>`,
      'style.css': `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: 'Inter', sans-serif; background: #f4f6f8; color: #333; padding: 2rem; }`,
      'script.js': `console.log('${projectName} loaded!');`,
    },
    portfolio: {
      'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${projectName}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <header class="navbar">\n    <div class="logo">${projectName}</div>\n    <nav>\n      <ul class="nav-links">\n        <li><a href="#" class="active">Home</a></li>\n        <li><a href="#about">About</a></li>\n        <li><a href="#contact">Contact</a></li>\n      </ul>\n    </nav>\n  </header>\n  <main class="hero">\n    <div class="hero-content">\n      <h1>Build. Code. Create.</h1>\n      <p>A modern workspace with AI assistance.</p>\n    </div>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>`,
      'style.css': `* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', sans-serif; }\nbody { background: #0f172a; color: #e2e8f0; }\n.navbar { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid #1e293b; position: fixed; width: 100%; top: 0; }\n.logo { font-size: 1.5rem; font-weight: 700; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }\n.nav-links { display: flex; list-style: none; gap: 2rem; }\n.nav-links a { color: #64748b; text-decoration: none; font-weight: 500; transition: color 0.3s; }\n.nav-links a:hover, .nav-links a.active { color: #6366f1; }\n.hero { min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; background: radial-gradient(ellipse at top, #1e1b4b 0%, #0f172a 50%); }\n.hero-content h1 { font-size: 4rem; font-weight: 800; background: linear-gradient(135deg, #fff, #a5b4fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }\n.hero-content p { font-size: 1.25rem; color: #64748b; margin-top: 1rem; }`,
      'script.js': `console.log('${projectName} initialized!');`,
    },
    landing: {
      'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${projectName}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <div class="container">\n    <header><h1>${projectName}</h1><p class="subtitle">Coming Soon</p></header>\n    <main>\n      <div class="card">\n        <h2>We're building something amazing</h2>\n        <p>Subscribe to get notified when we launch.</p>\n      </div>\n    </main>\n  </div>\n  <script src="script.js"></script>\n</body>\n</html>`,
      'style.css': `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #fff; }\n.container { text-align: center; padding: 2rem; max-width: 600px; }\nheader h1 { font-size: 3rem; font-weight: 800; margin-bottom: 0.5rem; }\n.subtitle { font-size: 1.25rem; opacity: 0.9; margin-bottom: 2rem; }\n.card { background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(10px); border-radius: 1rem; padding: 2rem; border: 1px solid rgba(255, 255, 255, 0.2); }\n.card h2 { font-size: 1.5rem; margin-bottom: 0.5rem; }\n.card p { opacity: 0.85; }`,
      'script.js': `console.log('${projectName} landing page loaded!');`,
    },
  };

  return templates[template] || templates.blank;
}
