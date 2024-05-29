import axios from "axios";
import fs from "fs";
import FormData from "form-data";
const camundaUrl = "http://localhost:8080/engine-rest";

/*** 
 * 1. Check processid is available in request
 * 2. if process id is available then consider update else add
 * 3. All call from external system will be considered as complete activity

*/

const processTheRequest = async (req, res) => {
    try {
        const requestData = req.body;
        const deployedProcessDefinitionsKey = requestData.deployedProcessDefinitionsKey;
        let processInstanceId = requestData.processInstanceId;

        delete requestData.deployedProcessDefinitionsKey;
        delete requestData.processInstanceId;

        if (deployedProcessDefinitionsKey === "") {
            res.send({ success: 0 });
        }
        const camundaVar = await convertToCamundaFormat(requestData);
        if (processInstanceId === "") {
            //Create Instanace/Task
            processInstanceId = await createTaskInstance(deployedProcessDefinitionsKey);
        }
        //Complete the task
        await completeTaskInstance(processInstanceId, camundaVar);
        res.json({ success: 1, processInstanceId: processInstanceId, message: "Success" });
    } catch (error) {
        console.log("processTheRequest :", error)
        res.json({ success: 0, message: error.message, error : error });
    }
};

const completeTaskInstance = async (processInstanceId, camundaVar = {}) => {
    //Get Pending Task
    const pendingTaskId = await getPendingTask(processInstanceId);
    if (pendingTaskId != "") {
        var options = {
            method: "POST",
            url: `${camundaUrl}/task/${pendingTaskId}/complete`,
            headers: { "Content-Type": "application/json" },
            data: camundaVar,
        };
        //console.log("options :", JSON.stringify(options))
        const camundaRes = await axios.request(options);
        //console.log("completeTaskInstance :", camundaRes.status , "-----", camundaRes.data)
        if (camundaRes.status === 200 || camundaRes.status === 204) {
            await callbackToApplication(processInstanceId);
        } else {
            throw new Error("Some error from workflow engine");
        }
    } else {
        throw new Error("There is no pending task available.");
    }
};

const createTaskInstance = async (deployedProcessDefinitionsKey) => {
    var options = {
        method: "POST",
        url: `${camundaUrl}/process-definition/key/${deployedProcessDefinitionsKey}/start`,
        headers: { "Content-Type": "application/json" },
        data: {},
    };
    const camundaRes = await axios.request(options);
    if (camundaRes.status === 200) {
        return camundaRes.data.id;
    } else {
        throw new Error("Some error from workflow engine");
    }
};

const getPendingTask = async (processInstanceId) => {
    try {
        var options = {
            method: "GET",
            url: `${camundaUrl}/task`,
            headers: { "Content-Type": "application/json" },
            params: { processInstanceId: processInstanceId },
        };
        const camundaRes = await axios.request(options);
        if (camundaRes.status === 200 && camundaRes.data.length > 0) {
            return camundaRes.data[0].id;
        }
        return "";
    } catch (error) {
        console.log("processTheRequest :", error);
        return "";
    }
};



const callbackToApplication = async (processInstanceId) => {
    try {
        //1. get next task id
        const nextPendingTaskId = await getPendingTask(processInstanceId);
        //2. get task variables if next task exist
        if (nextPendingTaskId != "") {
            const nextPendingTaskVariables = await getTaskVariables(nextPendingTaskId);
            //3. extract callback url and call
            if (nextPendingTaskVariables.callBackUrl && nextPendingTaskVariables.callBackUrl != "") {
                const callBackData = JSON.parse(nextPendingTaskVariables.callBackData);
                delete nextPendingTaskVariables.callBackData.header;
                const options = {
                    method: "POST",
                    url: nextPendingTaskVariables.callBackUrl,
                    headers: callBackData.header,
                    data: nextPendingTaskVariables,
                };
                console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
                console.log("callbackToApplication Request : ", options);
                const res = await axios.request(options);
                console.log("callbackToApplication Response : ", res.data);
                console.log("----------------------------------------------------------------------");
            }
        }
    } catch (error) {
        console.log("callbackToApplication :", error);
    }
};

const getTaskVariables = async (nextPendingTaskId) => {
    try {
        var options = {
            method: "GET",
            url: `${camundaUrl}/task/${nextPendingTaskId}/form-variables`,
            headers: { "Content-Type": "application/json" },
        };
        const camundaRes = await axios.request(options);
        if (camundaRes.status === 200) {
            return await convertToRegularFormat(camundaRes.data);
        } else if (camundaRes.status === 204) {
            return {};
        } else {
            throw new Error("Some error from workflow engine");
        }
    } catch (error) {
        console.log("getTaskVariables :", error);
        return {};
    }
};

const convertToCamundaFormat = async (data) => {
    let variables = {};
    //console.log(data);
    for (const key in data) {
        variables[key] = { value: data[key] };
    }
    return { variables: variables };
};

const convertToRegularFormat = async (data) => {
    let variables = {};

    for (const key in data) {
        variables[key] = data[key].value;
    }
    return variables;
};

const uploadBpmnFile = async (req, res) => {
    try {
        const form = new FormData();
        form.append("deployment-name", req.body.deploymentName);
        form.append("enable-duplicate-filtering", "true");
        form.append("deploy-changed-only", "true");
        // Append the file to the FormData object with a custom filename
        if (req.file && req.file.path && req.file.filename) {
            const filePath = req.file.path;
            const fileBuffer = fs.readFileSync(filePath);
            form.append("data", fileBuffer, req.file.filename);
        } else {
            throw new Error("Invalid file data.");
        }

        var options = {
            method: "POST",
            url: `${camundaUrl}/deployment/create`,
            headers: { ...form.getHeaders() },
            data: form,
        };
        const camundaRes = await axios.request(options);
        console.log("camundaRes.status : ", camundaRes.status);
        console.log("camundaRes.data.length : ", camundaRes.data);
        if (camundaRes.status === 200 && camundaRes.data) {
            if (camundaRes.data.id === undefined) {
                throw new Error(camundaRes.data.message);
            }
            const key = await extractProcessInstanceKey(camundaRes);
            res.json({ success: 1, deployedProcessDefinitionsKey: key });
        } else {
            throw new Error("Some error from workflow engine");
        }
    } catch (error) {
        res.json({ success: 0, message: error.message });
    }
};

const extractProcessInstanceKey = async (camundaRes) => {
    // Assuming deploymentData contains the provided JSON
    const deployedProcessDefinitions = camundaRes.data.deployedProcessDefinitions;

    // Extracting the first key from deployedProcessDefinitions
    const firstProcessDefinitionKey = Object.keys(deployedProcessDefinitions)[0];

    // Extracting the "Key" from the first process definition
    return deployedProcessDefinitions[firstProcessDefinitionKey].key;
};

export { processTheRequest, uploadBpmnFile };
