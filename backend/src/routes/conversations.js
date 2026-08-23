const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getAll, getById, createOrGet, remove } = require('../controllers/conversations');

const router = Router();

router.use(authenticate);

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', createOrGet);
router.delete('/:id', remove);

module.exports = router;
