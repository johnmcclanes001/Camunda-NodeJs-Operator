
import multer from "multer";
import fs from "fs";

export const multerStorage = {
    storage: multer.diskStorage({
        destination: async (req, file, next) => {
            
            try {
                const { extention, name } = await getFileExtention(file.originalname);
                 
                const temp_folder_path = './public/';
                if (!fs.existsSync(temp_folder_path)) {
                    fs.mkdirSync(temp_folder_path, { recursive: true });
                    fs.chmodSync(temp_folder_path, 0o777);
                    next(null, temp_folder_path);
                }
            } catch (error) {
                next({ statusCode: 200, messageCode: error.message });
            }
        },
        filename: async (req, file, next) => {
            const { extention, name } = await getFileExtention(file.originalname);
            const file_name = `${await getUNQID()}_${await convertToSnakeCase(name)}.${extention}`;
            next(null, file_name);
        }
    }),
    limits: {
        fileSize: 1024 * 1024 * 100 //100mb
    },
};

export const getFileExtention = async (file_name) => {
    const return_arr = {
        name: file_name.substring(0, file_name.lastIndexOf(".")),
        extention: file_name.slice(file_name.lastIndexOf(".") + 1),
    };
    console.log(return_arr);
    return return_arr;
};

const getUNQID = async () => {
    return new Date().getTime().toString()+getRandomInt(5);
}
function getRandomInt(max) {
    return Math.floor(Math.random() * max);
  }
  function convertToSnakeCase(inputString) {
    return inputString.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/\s+/g, '_');
  }