const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist
const imgDir = path.join(__dirname, 'img');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir);
}
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer storage configuration for images
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imgDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Multer storage configuration for general files
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const uploadImage = multer({ storage: imageStorage });
const uploadFile = multer({ storage: fileStorage });

// Route for uploading an image
app.post('/upload/image', uploadImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No image uploaded.');
    }
    res.status(200).send(`Image uploaded successfully: ${req.file.filename}`);
});

// Route for uploading a general file
app.post('/upload/file', uploadFile.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.status(200).send(`File uploaded successfully: ${req.file.filename}`);
});

// Route for reading a file
app.get('/file/:filename', (req, res) => {
    const filename = req.params.filename;
    let filePath = path.join(uploadsDir, filename);

    // Check if the file exists in the img directory if not found in uploads
    if (!fs.existsSync(filePath)) {
        filePath = path.join(imgDir, filename);
    }

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File not found.');
    }
});

// Route for updating a file (overwrites existing file)
app.put('/file/:filename', uploadFile.single('file'), (req, res) => {
    const filename = req.params.filename;
    let filePath = path.join(uploadsDir, filename);

    // Check if the file exists in the img directory if not found in uploads
    if (!fs.existsSync(filePath)) {
        filePath = path.join(imgDir, filename);
    }

    if (!req.file) {
        return res.status(400).send('No file provided for update.');
    }

    if (fs.existsSync(filePath)) {
        // Delete the old file before saving the new one
        fs.unlinkSync(filePath);
        // Multer has already saved the new file with a new name, so we need to rename it
        const newFilePath = path.join(req.file.destination, req.file.filename);
        fs.renameSync(newFilePath, filePath);
        res.status(200).send(`File ${filename} updated successfully.`);
    } else {
        res.status(404).send('Original file not found for update.');
    }
});

// Route for deleting a file
app.delete('/file/:filename', (req, res) => {
    const filename = req.params.filename;
    let filePath = path.join(uploadsDir, filename);

    // Check if the file exists in the img directory if not found in uploads
    if (!fs.existsSync(filePath)) {
        filePath = path.join(imgDir, filename);
    }

    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                return res.status(500).send('Error deleting file.');
            }
            res.status(200).send(`File ${filename} deleted successfully.`);
        });
    } else {
        res.status(404).send('File not found.');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
