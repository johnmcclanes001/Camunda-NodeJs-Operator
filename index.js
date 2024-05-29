import { Client, logger } from "camunda-external-task-client-js";
import axios from "axios";

import express from "express";
import cors from "cors";
import { processTheRequest, uploadBpmnFile } from "./camunda.js";
import multer from "multer";

const app = new express();
app.use(cors());
// For parsing application/json
app.use(express.json());

// For parsing application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Set up multer for file uploads
// Multer Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./public/uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    },
});
const upload = multer({ storage });
//app.use(form.any());

app.post("/uploadBpmnFile", upload.single("bpmnFile"), (req, res) => {
    if (!req.file) {
        res.json({ success: 0, message: "File is not uploaded" });
    } else {
        uploadBpmnFile(req, res);
    }
});

app.get("/", (req, res) => {
    res.send("Hello world");
});

app.post("/processWorkFlow", (req, res) => {
    processTheRequest(req, res);
});

app.post("/callBack", (req, res) => {
  // Log incoming headers
  console.log('Incoming Headers:', req.headers);

  // Log entire request object
  console.log('Incoming Request:', req.body);
  res.json({success:1})
});

app.post("/test", (req, res) => {
    res.send(req.body);
});

app.listen(3000, () => {
    console.log("server is started at port 3000");
});

// configuration for the Client:
//  - 'baseUrl': url to the Process Engine
//  - 'logger': utility to automatically log important events
const config = {
    baseUrl: "http://localhost:8080/engine-rest",
    use: logger,
};

// create a Client instance with custom configuration
const client = new Client(config);

// susbscribe to the topic: 'finalApprovedTopic'
client.subscribe("finalApprovedTopic", async function ({ task, taskService }) {
    try {
        // complete the task
        //const invoice = await new File({ localPath: "./assets/invoice.txt" }).load();
        const result = await taskService.complete(task);
        
        console.log("------------------finalApprovedTopic - result--------------------------  : ", result);
        console.log("--------------------------------------------");
        
        console.log("------------------finalApprovedTopic - variables-------------------------- ");
        // Put your business logic
        const variables = task.variables.getAll();
        if(variables.callBackData)
        {
            const callBackData = JSON.parse(variables.callBackData);
            console.log("callBackData => ",callBackData); 
            const options = {
                method: "POST",
                url: callBackData.callBackUrl,
                headers: callBackData.headers,
                data: callBackData.data,
            };
            console.log("options => ",options);
            const res = await axios.request(options);
            console.log("Finas API - result  : ", res.data);
        }
        
        
        console.log("-------------------------------------------- ");

        
    } catch (error) {
        console.log(error);
        console.log("------------------finalApprovedTopic - Error-------------------------- ");
    }
});
