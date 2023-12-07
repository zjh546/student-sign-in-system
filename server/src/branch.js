const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

const select = require("@inquirer/select");
const input = require("@inquirer/input");
const { JavaCaller } = require("java-caller");
const progressBar = require("@jyeontu/progress-bar");

const {
  selectGroupByInitiatorName,
  createNewSign,
  endSign,
  insertUserInfo,
  selectAllUser,
  selectSignHistoryByUserName
} = require("./server/database-sql");

const { formatDateTime, formatUTC } = require("./utils/time");
const { generateRandomString, delay } = require("./utils/main");
const { chalkSecondConsole, chalkMainConsole, chalkThirdConsole } = require("./utils/console");
const { getJavaEnv, openBrowser } = require("./utils/env");

const server_threads = path.resolve(__dirname, "./server/server.js");
const database_threads = path.resolve(__dirname, "./server/database.js");

const instrBranch = [
  // 签到
  [
    (flag) => flag === "qd",
    (userInfo) => {
      return new Promise(async (resolve, reject) => {
        // 查找该发起者的群组
        const group_data = await selectGroupByInitiatorName(userInfo[0].initiator_name);
        const new_group_data = group_data.map((item) => ({
          name: item.group_name,
          value: item.group_name
        }));

        // 选择群组
        const group = await select.default({
          message: "请选择签到的群组",
          choices: new_group_data
        });

        // 新建签到
        const group_info = group_data.find((item) => item.group_name === group);

        const sign_id = new Date().getTime();
        const group_id = group_info.group_id;
        const initiator_id = userInfo[0].initiator_id;
        const sign_code = generateRandomString();

        console.log(`签到码：${chalkSecondConsole(sign_code, true)}`);

        await createNewSign(sign_id, group_id, initiator_id, sign_code);

        // 子线程处理
        const worker = new Worker(server_threads);
        worker.postMessage("server:start");
        worker.on("message", async (message) => {
          if (message === "server:start:ok") {
          }

          if (message === "server:close:ok") {
            // 关闭子线程
            worker.terminate();

            // 关闭签到
            const last_at = formatDateTime(new Date().getTime());
            await endSign(sign_id, last_at);

            resolve();
          }
        });

        chalkMainConsole(`${group}开始签到~`);
        while (true) {
          const server_answer = await input.default({ message: "如果需要关闭签到请输入 [close]: \n" });

          if (server_answer === "close") {
            worker.postMessage("server:close");
            chalkMainConsole(`${group}签到结束~`);

            break;
          } else {
            chalkSecondConsole("输入错误");
          }
        }
        console.log("===============================================\n");
      });
    }
  ],
  // 查看
  [
    (flag) => flag === "ck",
    async () => {
      // 查找用户
      const choices = [];
      const allUser = await selectAllUser();
      allUser.forEach((item) => choices.push({ name: item.user_name, value: item.user_name }));
      choices.push({ name: "退出查询", value: "_query_close" });

      while (true) {
        const answer = await select.default({
          message: "请选择你要查询的用户~",
          choices: choices
        });

        if (answer === "_query_close") break;

        const result = await selectSignHistoryByUserName(answer);
        if (result.length === 0) {
          console.log("没得数据哦~");
        } else {
          result.forEach((item) => {
            console.log(
              `姓名:${item.user_name} 群组:${item.group_name} 发起者:${item.initiator_name} 签到时间:${formatUTC(item.sign_time)}`
            );
          });
        }

        console.log("\n");
      }
    }
  ],
  // 导入
  [
    (flag) => flag === "dr",
    async () => {
      // 进度条
      const progressBarHandler = () => {
        let timer;
        const progressBarC = new progressBar({
          duration: 100,
          current: 0,
          block: "█",
          showNumber: true,
          tip: {
            0: "努力加载中……",
            50: "加载一半啦，不要着急……",
            75: "马上就加载完了……",
            100: "加载完成"
          },
          color: "blue"
        });

        return {
          startProgress(endProgress = 99) {
            let i = 0;
            timer = setInterval(() => {
              progressBarC.run(i++);
              if (i === endProgress) {
                clearInterval(timer);
              }
            }, 75);
          },
          endProgress() {
            progressBarC.run(100);
            clearInterval(timer);
          }
        };
      };

      // 调取 Java
      const java_env = getJavaEnv();
      const java_read_jar = "./libs/ReadTxt.jar";
      const java_main_class = "com.zjh.ReadTxt";

      const file_name = await input.default({ message: "文件名(默认访问files文件夹下内容)" });

      console.log("\n");
      const { startProgress, endProgress } = progressBarHandler();
      startProgress();

      const java = new JavaCaller({
        classPath: java_read_jar,
        mainClass: java_main_class,
        rootPath: __dirname,
        javaExecutable: path.resolve(java_env.JAVA_JDK_EXE)
      });
      const file_path = path.resolve(__dirname, "../files", file_name);
      const { status, stdout, stderr } = await java.run(["-Xmx1024m", "-Dfile.encoding=UTF-8", file_path]);

      if (status === 0) {
        try {
          // 解析数据
          const person = stdout
            ?.split("\r\n")
            ?.filter((item) => item)
            ?.map((item, index) => {
              const info = item.split(" ");

              const user_id = info[0];
              const user_name = info[1];
              const user_account = info[2];
              const user_password = info[3];

              return { user_id, user_name, user_account, user_password };
            });

          // 插入数据库
          await insertUserInfo(person);

          await delay(3000); // 延时3s - 演示进度条
          endProgress();

          console.log("\n");
          chalkThirdConsole("本次添加的数据：");
          person.forEach((item) => {
            console.log(`${item.user_id}  姓名：${item.user_name} 账户：${item.user_account} 密码：${item.user_password}`);
          });
        } catch (error) {
          chalkMainConsole("error~ 错误了");
        }
      } else if (status === 1) {
        chalkMainConsole("error~ 错误了");
      }
    }
  ],
  // 导出
  [
    (flag) => flag === "dc",
    async () => {
      const choices = [];
      const allUser = await selectAllUser();
      allUser.forEach((item) => choices.push({ name: item.user_name, value: item.user_name }));
      choices.push({ name: "退出导出", value: "_query_close" });

      const answer = await select.default({
        message: "请选择你要导出的用户数据~",
        choices: choices
      });

      if (answer === "_query_close") return;

      const sign_infos = await selectSignHistoryByUserName(answer);
      if (sign_infos.length > 0) {
        // 组合字符
        let sign_info_write = "";
        sign_infos.forEach((item) => {
          sign_info_write += `${item.user_name} ${item.group_name} ${item.initiator_name} ${formatUTC(item.sign_time)}\n`;
        });

        // 写入数据
        const write_path = path.resolve(__dirname, "../files", `${answer}-签到记录.txt`);
        fs.writeFileSync(write_path, sign_info_write, { encoding: "utf-8" });
      } else {
        console.log("没有可以导出的数据哦~");
      }
    }
  ],
  // 源码
  [
    (flag) => flag === "ym",
    async () => {
      openBrowser("https://github.com/zjh546/student-sign-in-system");
    }
  ]
];

module.exports = instrBranch;
