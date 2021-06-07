const fs = require('fs');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

const HttpError = require('../models/http-error');
const getCoordsForAddress = require('../util/location');
const Place = require('../models/place');
const User = require('../models/user');

exports.getPlaceById = async (req, res, next) => {
	const placeId = req.params.pid;
	let place;
	try {
		place = await Place.findById(placeId);
	} catch (err) {
		return next(new HttpError('Something went wrong, place not found.', 500));
	}

	if (!place) {
		return next(new HttpError('Place not found with provided id.', 404));
	}

	res.status(200).json({ place: place.toObject({ getters: true }) });
};

exports.getPlacesByUserId = async (req, res, next) => {
	const userId = req.params.uid;
	let places;
	try {
		places = await Place.find({ creator: userId });
	} catch (err) {
		return next(new HttpError('Something went wrong, place not found.', 500));
	}
	if (!places || places.length === 0) {
		return next(new HttpError('Places not found with provided user id.', 404));
	}
	res.json({ places: places.map(p => p.toObject({ getters: true })) });
};

exports.createPlace = async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(new HttpError('Invalid input, please check yout data.', 422));
	}

	const { title, description, address } = req.body;

	const coordinates = getCoordsForAddress(address);

	const createdPlace = new Place({
		title,
		description,
		image: req.file.path,
		location: coordinates,
		address,
		creator: req.userData.userId
	});

	let user;
	try {
		user = await User.findById(req.userData.userId);

		if (!user) {
			return next(new HttpError('Could not find user for provided id.', 404));
		}

		const session = await mongoose.startSession();
		session.startTransaction();
		await createdPlace.save({ session });
		user.places.push(createdPlace);
		await user.save({ session });
		await session.commitTransaction();
	} catch (err) {
		return next(new HttpError('Creating place failed, please try again.', 500));
	}
	res.status(201).json({ place: createdPlace });
};

exports.updatePlace = async (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return next(new HttpError('Invalid input, please check yout data.', 422));
	}

	const { title, description } = req.body;
	const placeId = req.params.pid;

	let place;
	try {
		place = await Place.findById(placeId);
	} catch (err) {
		return next(new HttpError('Something went wrong, place not found.', 500));
	}

	if (place.creator.toString() !== req.userData.userId) {
		return next(new HttpError('You are not allowed to edit this place.', 401));
	}

	place.title = title;
	place.description = description;
	try {
		await place.save();
	} catch (err) {
		return next(
			new HttpError('Something went wrong, please try again later.', 500)
		);
	}

	res.status(200).json({ place: place.toObject({ getters: true }) });
};

exports.deletePlace = async (req, res, next) => {
	const placeId = req.params.pid;
	let place;

	try {
		place = await Place.findById(placeId).populate('creator');
		if (!place) {
			return next(new HttpError('Place not found.', 404));
		}
	} catch (err) {
		return next(new HttpError('Something went wrong, place not found.', 500));
	}

	if (place.creator.id !== req.userData.userId) {
		return next(
			new HttpError('You are not allowed to delete this place.', 401)
		);
	}

	const imagePath = place.image;
	try {
		const session = await mongoose.startSession();
		session.startTransaction();
		await place.remove({ session });
		place.creator.places.pull(place);
		await place.creator.save({ session });
		await session.commitTransaction();

		fs.unlink(imagePath, err => {
			console.log(err);
		});
	} catch (err) {
		return next(
			new HttpError('Something went wrong, place was not removed.', 500)
		);
	}

	res.status(200).json({ message: 'Place was deleted' });
};
