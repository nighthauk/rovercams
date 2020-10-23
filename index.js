/**
 * Hello Mars
 * 
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.helloWorld = (req, res) => {
    res.send('Hello, Mars!');
};