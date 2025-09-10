const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { oauth2client } = require('./index'); // Import oauth2client from index.js

const app = express();
const PORT = 3000;

// Initialize Google Drive API
const drive = google.drive({ version: 'v3', auth: oauth2client });

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist (for local storage, still useful for multer temp files)
const imgDir = path.join(__dirname, 'img');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir);
}
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer storage configuration for local uploads (used as temporary storage before uploading to Drive)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Use uploadsDir for all temporary files
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// --- Google Drive Functions ---

async function uploadFileToDrive(file, fileType, folderId = null) {
    try {
        const fileMetadata = {
            name: file.originalname,
            mimeType: fileType,
            parents: folderId ? [folderId] : [] // Optional: specify a folder ID
        };
        const media = {
            mimeType: fileType,
            body: fs.createReadStream(file.path)
        };
        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name'
        });

        // Make the file public
        await drive.permissions.create({
            fileId: response.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        // Delete the temporary file after uploading to Drive
        fs.unlinkSync(file.path);
        return response.data;
    } catch (error) {
        console.error('Error uploading file to Drive:', error);
        throw error;
    }
}

async function downloadFileFromDrive(fileId, res) {
    try {
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'stream' });

        response.data
            .on('end', () => console.log('Done downloading file.'))
            .on('error', err => {
                console.error('Error downloading file.', err);
                res.status(500).send('Error downloading file.');
            })
            .pipe(res); // Pipe the file directly to the response
    } catch (error) {
        console.error('Error downloading file from Drive:', error);
        throw error;
    }
}

async function getFileMetadataFromDrive(fileId) {
    try {
        const response = await drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, webViewLink, webContentLink, parents'
        });
        const metadata = response.data;
        // Add the public download link in the desired format
        metadata.publicDownloadLink = `https://drive.google.com/uc?id=${metadata.id}`;
        return metadata;
    } catch (error) {
        console.error('Error getting file metadata from Drive:', error);
        throw error;
    }
}

async function updateFileInDrive(fileId, newFile, fileType) {
    try {
        const fileMetadata = {
            name: newFile.originalname,
            mimeType: fileType
        };
        const media = {
            mimeType: fileType,
            body: fs.createReadStream(newFile.path)
        };
        const response = await drive.files.update({
            fileId: fileId,
            resource: fileMetadata,
            media: media,
            fields: 'id, name'
        });
        // Delete the temporary file after updating in Drive
        fs.unlinkSync(newFile.path);
        return response.data;
    } catch (error) {
        console.error('Error updating file in Drive:', error);
        throw error;
    }
}

async function deleteFileFromDrive(fileId) {
    try {
        const response = await drive.files.delete({
            fileId: fileId
        });
        return response.status;
    } catch (error) {
        console.error('Error deleting file from Drive:', error);
        throw error;
    }
}

async function searchFileInDrive(fileName) {
    try {
        const response = await drive.files.list({
            q: `name contains '${fileName}'`,
            fields: 'files(id, name, mimeType)'
        });
        return response.data.files;
    } catch (error) {
        console.error('Error searching file in Drive:', error);
        throw error;
    }
}

async function getAllFilesFromDrive(fileType = null) {
    try {
        let query = '';
        if (fileType) {
            query = `mimeType = '${fileType}'`;
        } else {
            // Exclude folders from the list of files
            query = `mimeType != 'application/vnd.google-apps.folder'`;
        }

        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType, webViewLink, webContentLink)'
        });
        return response.data.files;
    } catch (error) {
        console.error('Error getting all files from Drive:', error);
        throw error;
    }
}

async function getAllFoldersFromDrive() {
    try {
        const response = await drive.files.list({
            q: "mimeType = 'application/vnd.google-apps.folder'",
            fields: 'files(id, name)'
        });
        return response.data.files;
    } catch (error) {
        console.error('Error getting all folders from Drive:', error);
        throw error;
    }
}

async function createFolderInDrive(folderName, parentId = null) {
    try {
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : []
        };
        const response = await drive.files.create({
            resource: fileMetadata,
            fields: 'id, name'
        });
        return response.data;
    } catch (error) {
        console.error('Error creating folder in Drive:', error);
        throw error;
    }
}

async function deleteFolderFromDrive(folderId) {
    try {
        const response = await drive.files.delete({
            fileId: folderId
        });
        return response.status;
    } catch (error) {
        console.error('Error deleting folder from Drive:', error);
        throw error;
    }
}


// --- Google Drive Routes ---

app.post('/drive/upload/image', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No image uploaded.');
    }
    try {
        const result = await uploadFileToDrive(req.file, req.file.mimetype);
        res.status(200).json({ message: 'Image uploaded to Drive successfully', file: result });
    } catch (error) {
        res.status(500).send('Failed to upload image to Drive.');
    }
});

app.post('/drive/upload/file', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    try {
        const result = await uploadFileToDrive(req.file, req.file.mimetype);
        res.status(200).json({ message: 'File uploaded to Drive successfully', file: result });
    } catch (error) {
        res.status(500).send('Failed to upload file to Drive.');
    }
});

app.get('/drive/file/:fileId', async (req, res) => {
    try {
        await downloadFileFromDrive(req.params.fileId, res);
    } catch (error) {
        res.status(500).send('Failed to download file from Drive.');
    }
});

app.get('/drive/file/metadata/:fileId', async (req, res) => {
    try {
        const metadata = await getFileMetadataFromDrive(req.params.fileId);
        res.status(200).json(metadata);
    } catch (error) {
        res.status(500).send('Failed to get file metadata from Drive.');
    }
});

app.put('/drive/file/:fileId', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file provided for update.');
    }
    try {
        const result = await updateFileInDrive(req.params.fileId, req.file, req.file.mimetype);
        res.status(200).json({ message: 'File updated in Drive successfully', file: result });
    } catch (error) {
        res.status(500).send('Failed to update file in Drive.');
    }
});

app.delete('/drive/file/:fileId', async (req, res) => {
    try {
        const status = await deleteFileFromDrive(req.params.fileId);
        if (status === 204) {
            res.status(200).send('File deleted from Drive successfully.');
        } else {
            res.status(500).send('Failed to delete file from Drive.');
        }
    } catch (error) {
        res.status(500).send('Failed to delete file from Drive.');
    }
});

app.get('/drive/search/:fileName', async (req, res) => {
    try {
        const files = await searchFileInDrive(req.params.fileName);
        res.status(200).json({ files: files });
    } catch (error) {
        res.status(500).send('Failed to search for files in Drive.');
    }
});

app.get('/drive/files', async (req, res) => {
    try {
        const files = await getAllFilesFromDrive();
        res.status(200).json({ files: files });
    } catch (error) {
        res.status(500).send('Failed to get all files from Drive.');
    }
});

app.get('/drive/folders', async (req, res) => {
    try {
        const folders = await getAllFoldersFromDrive();
        res.status(200).json({ folders: folders });
    } catch (error) {
        res.status(500).send('Failed to get all folders from Drive.');
    }
});

app.post('/drive/folder', async (req, res) => {
    const { folderName, parentId } = req.body;
    if (!folderName) {
        return res.status(400).send('Folder name is required.');
    }
    try {
        const folder = await createFolderInDrive(folderName, parentId);
        res.status(200).json({ message: 'Folder created successfully', folder: folder });
    } catch (error) {
        res.status(500).send('Failed to create folder in Drive.');
    }
});

app.delete('/drive/folder/:folderId', async (req, res) => {
    try {
        const status = await deleteFolderFromDrive(req.params.folderId);
        if (status === 204) {
            res.status(200).send('Folder deleted successfully.');
        } else {
            res.status(500).send('Failed to delete folder from Drive.');
        }
    } catch (error) {
        res.status(500).send('Failed to delete folder from Drive.');
    }
});


// --- Existing Local File Routes (kept for reference, can be removed if not needed) ---

// Route for uploading an image (local)
app.post('/upload/image', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No image uploaded.');
    }
    res.status(200).send(`Image uploaded successfully: ${req.file.filename}`);
});

// Route for uploading a general file (local)
app.post('/upload/file', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.status(200).send(`File uploaded successfully: ${req.file.filename}`);
});

// Route for reading a file (local)
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

// Route for updating a file (overwrites existing file) (local)
app.put('/file/:filename', upload.single('file'), (req, res) => {
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

// Route for deleting a file (local)
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