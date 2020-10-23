/**
 * Hello Mars
 * 
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.helloMars = (req, res) => {
    res.send('Hello, Mars!');
};