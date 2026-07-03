import express from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectFiles,
  updateProjectFiles,
} from '../controllers/projectController.mjs';

const router = express.Router();

router.get('/', listProjects);
router.get('/:id', getProject);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);
router.get('/:id/files', getProjectFiles);
router.put('/:id/files', updateProjectFiles);

export default router;
