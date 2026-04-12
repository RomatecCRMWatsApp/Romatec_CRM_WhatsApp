// Import necessary modules
import express from 'express';
import { SomeMiddleware } from './middleware';

const router = express.Router();

// Route to get a user by ID
router.get('/user/:id', async (req, res) => {
    const userId = req.params.id;
    const user = await getUserById(userId);
    if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    res.json(user);
});

// Route to get available properties
router.get('/properties', async (req, res) => {
    const properties = await getAvailableProperties();
    if (!properties.length) {
        return res.status(404).json({ message: 'Nenhum imóvel disponível' });
    }
    res.json(properties);
});

// Route to get a property by ID
router.get('/property/:id', async (req, res) => {
    const propertyId = req.params.id;
    const property = await getPropertyById(propertyId);
    if (!property) {
        return res.status(404).json({ message: 'Imóvel não encontrado' });
    }
    res.json(property);
});

// Route to create a property
router.post('/property', SomeMiddleware, async (req, res) => {
    const propertyData = req.body;
    const description = getDescriptionForProperty(propertyData);
    if (!description) {
        return res.status(400).json({ message: 'Descrição não gerada' });
    }
    const newProperty = await createProperty(propertyData);
    res.status(201).json(newProperty);
});

// Route for WhatsApp connection
router.get('/whatsapp/status', async (req, res) => {
    const isConnected = await checkWhatsAppConnection();
    if (!isConnected) {
        return res.status(500).json({ message: 'WhatsApp não está conectado' });
    }
    res.json({ status: 'connected' });
});

// Route for Z-API connection
router.get('/zapi/status', async (req, res) => {
    const isConfigured = await checkZAPIConfig();
    if (!isConfigured) {
        return res.status(500).json({ message: 'Z-API não configurado' });
    }
    res.json({ status: 'configured' });
});

// Route for message variations
router.get('/message/variations', (req, res) => {
    const variations = getMessageVariations();
    res.json({ variations: variations });
});

export default router;