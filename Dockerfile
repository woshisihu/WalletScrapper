# 使用 Apify 官方 Puppeteer + Chrome 镜像（内置 Chrome）
FROM apify/actor-node-puppeteer-chrome:latest

# 复制项目文件
COPY . ./

# 安装依赖（--only=prod 加速）
RUN npm install --quiet --only=prod --no-optional

# 指定启动命令
CMD ["node", "getCoinsAddress.js"]
