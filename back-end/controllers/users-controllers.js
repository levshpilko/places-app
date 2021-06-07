const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const HttpError = require('../models/http-error');
const User = require('../models/user');

exports.getUsers = async (req, res, next) => {
	let users;
	try {
		users = await User.find({}, '-password');
	} catch (err) {
		return next(new HttpError('Fetching users failed.', 500));
	}

	res.json({ users: users.map(u => u.toObject({ getters: true })) });
};

exports.signup = async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(new HttpError('Invalid input, please check yout data.', 422));
	}

	const { name, email, password } = req.body;

	let existingUser;
	try {
		existingUser = await User.findOne({ email });
	} catch (err) {
		return next(new HttpError('Sign up failed, please try again later.', 500));
	}

	if (existingUser)
		return next(
			new HttpError('User already exists, please login instead', 422)
		);

	let token;
	let createdUser;
	try {
		createdUser = new User({
			name,
			email,
			password: await bcrypt.hash(password, 12),
			image: req.file.path,
			places: []
		});

		await createdUser.save();

		token = jwt.sign(
			{ userId: createdUser.id, email: createdUser.email },
			process.env.JWT_KEY,
			{ expiresIn: '1h' }
		);
	} catch (err) {
		return next(new HttpError('Signup failed, please try again.', 500));
	}

	res.status(201).json({
		userId: createdUser.id,
		email: createdUser.email,
		token
	});
};

exports.login = async (req, res, next) => {
	const { email, password } = req.body;

	let existingUser;
	let isValidPassword = false;
	let token;

	try {
		existingUser = await User.findOne({ email });
		if (!existingUser) {
			return next(new HttpError('Login failed, invalid credentials', 403));
		}

		isValidPassword = await bcrypt.compare(password, existingUser.password);
		if (!isValidPassword) {
			return next(new HttpError('Login failed, invalid credentials', 403));
		}
	} catch (err) {
		return next(new HttpError('Login failed, please try again later.', 500));
	}

	token = jwt.sign(
		{ userId: existingUser.id, email: existingUser.email },
		process.env.JWT_KEY,
		{ expiresIn: '1h' }
	);

	res.status(201).json({
		userId: existingUser.id,
		email: existingUser.email,
		token
	});
};
